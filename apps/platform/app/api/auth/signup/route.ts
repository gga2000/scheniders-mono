import { after, NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { isAuthWeakPasswordError } from '@supabase/supabase-js';
import { createSupabaseServiceClient } from '@/lib/supabase-server';
import { generateSlug, ensureUniqueSlug, isSlugFree, suggestFreeSlug } from '@/lib/tenant';
import { normalizeSlug, slugRejection } from '@/lib/tenant-slug';
import { consumeRateLimit, rateLimitHeaders } from '@/lib/rate-limit';
import { requestIp } from '@/lib/request-ip';
import { reportOrderError } from '@/lib/order-telemetry';
import { verifyTurnstile } from '@/lib/turnstile';
import { buildStarterStoreConfigV2, SIGNUP_TEMPLATE_ID } from '@/lib/starter-store';
import { DEFAULT_PACK_ID } from '@/lib/store-templates/content-packs';
import { attributeTemplatesFor, BUSINESS_TYPE_IDS, mergeAttributeSets, packIdFor } from '@/lib/business-types';
import { withFailureReport } from "@/lib/job-monitor";
import { normalizeIraqiMobile } from '@scheniders/shared';
import { env } from '@/lib/env';
import { buildStorefrontUrl } from '@/lib/storefront-url';
import { linkSignupProof, loadSignupWhatsApp, releaseSignupProof, sendSignupWelcome, spendSignupProof } from '@/lib/signup-phone-code';
import { TRIAL_DAYS } from '@/lib/trial';
import { passwordIsWeak } from '@/lib/password-policy';
import { recordPasswordStrength } from '@/lib/password-reminder';
import { newSignupWaitTicket } from '@/lib/signup-wait';

/**
 * Every self-serve signup starts a 7-day trial on Team, with no order cap
 * (Fermi handoff A1 and Q6). The merchant picks the plan they will pay for on
 * the billing page (change_plan stores it as the subscription's pending plan);
 * one who does not pick pays for Team. The plan is never taken from the request.
 */
const TRIAL_PLAN = 'growth';

// Each signup creates an auth user, a tenant and four supporting rows with the
// service role. Vercel sets the client IP; mobile carriers share NATs, so the
// cap is generous for people and still stops scripted tenant creation.
const SIGNUP_LIMIT = 10;
const SIGNUP_WINDOW_SECONDS = 60 * 60;

const optionalText = z.string().trim().max(200).optional().transform((v) => v || null);

const signupSchema = z.object({
    email: z.string().trim().toLowerCase().pipe(z.email()),
    password: z.string().min(8, 'Password must be at least 8 characters').max(72),
    business_name: z.string().trim().min(1).max(120),
    /**
     * The owner's mobile, the store's WhatsApp. Optional; one that is there
     * must be an Iraqi mobile, and it is saved as 07XXXXXXXXX whether it was
     * typed with Arabic, Persian or English digits, spaces or +964.
     */
    contact_phone: z
        .string()
        .max(40)
        .optional()
        .transform((v, ctx) => {
            if (v === undefined || v.trim() === '') return null;
            const mobile = normalizeIraqiMobile(v);
            if (!mobile) {
                ctx.addIssue({ code: 'custom', message: 'Not an Iraqi mobile number' });
                return z.NEVER;
            }
            return mobile;
        }),
    city: optionalText,
    /**
     * «شنو تبيع؟» (Fermi B10), in the order ticked. The form asks for at least
     * one; a page loaded before the question existed sends none, and that
     * store starts neutral like every store made before it.
     */
    business_types: z
        .array(z.enum(BUSINESS_TYPE_IDS))
        .max(BUSINESS_TYPE_IDS.length)
        .optional()
        .transform((types) => [...new Set(types ?? [])]),
    /**
     * The store's address the merchant chose (Fermi B11). Taken exactly or
     * refused: a store never ends up on an address its owner did not pick.
     * A page loaded before the field existed sends none, and the address is
     * made from the store's name as before.
     */
    slug: z.string().max(64).optional().transform((v) => (v === undefined ? undefined : normalizeSlug(v))),
    captcha_token: z.string().optional(),
    /**
     * The proof /api/auth/phone-code/verify handed back for contact_phone
     * (Fermi B11). Needed while the console's code switch is on.
     */
    phone_proof: z.uuid().optional(),
});

// Two sign-ups picking the same free slug at once: the loser's insert hits the
// unique index, and the next lookup sees the winner and picks the next slug.
const SLUG_ATTEMPTS = 3;
const UNIQUE_VIOLATION = '23505';


// =============================================
// POST /api/auth/signup
// Creates a new tenant + user account
// =============================================

async function handlePOST(request: NextRequest) {
    try {
        const ip = requestIp(request);
        const limit = await consumeRateLimit(`signup:${ip}`, SIGNUP_LIMIT, SIGNUP_WINDOW_SECONDS);
        if (limit.error) {
            // Fails open so signup keeps working, but never silently.
            reportOrderError(new Error(`Rate limiter unavailable: ${limit.error}`), { operation: 'signup-rate-limit' });
        }
        if (!limit.allowed) {
            return NextResponse.json(
                { error: `Too many sign-up attempts. Try again in ${limit.retryAfterSeconds}s.` },
                { status: 429, headers: rateLimitHeaders(limit, SIGNUP_LIMIT) },
            );
        }

        const parsed = signupSchema.safeParse(await request.json().catch(() => null));
        if (!parsed.success) {
            const issue = parsed.error.issues[0];
            // `field` lets the form show the problem under the field it is about.
            const field = typeof issue?.path[0] === 'string' ? issue.path[0] : null;
            return NextResponse.json(
                { error: issue?.message ?? 'Invalid sign-up details', code: 'invalid', field },
                { status: 400 },
            );
        }
        const { email, password, business_name, contact_phone: mobile, city, business_types, slug: chosenSlug, captcha_token, phone_proof } = parsed.data;

        // This route creates the account with the service role, so Supabase's
        // own CAPTCHA never sees it: check the Turnstile token here first.
        const captcha = await verifyTurnstile(captcha_token, ip === 'unknown' ? null : ip);
        if (!captcha.ok) {
            if (captcha.reason === 'unavailable') {
                reportOrderError(new Error('Turnstile siteverify unavailable'), { operation: 'signup-captcha' });
                return NextResponse.json(
                    { error: 'Security check unavailable. Try again in a minute.', code: 'captcha_unavailable' },
                    { status: 503 },
                );
            }
            return NextResponse.json(
                { error: 'Security check failed. Try again.', code: 'captcha_failed' },
                { status: 403 },
            );
        }
        const plan = TRIAL_PLAN;

        const adminClient = createSupabaseServiceClient();

        // The store's slug is chosen before any account exists: the lookups
        // throw when they fail, and failing here leaves nothing behind.
        const baseSlug = chosenSlug ?? generateSlug(business_name);
        if (chosenSlug !== undefined) {
            const rejection = slugRejection(chosenSlug);
            if (rejection) {
                return NextResponse.json(
                    { error: 'This store address cannot be used.', code: 'slug_invalid', reason: rejection },
                    { status: 422 },
                );
            }
            if (!(await isSlugFree(chosenSlug))) {
                return NextResponse.json(
                    { error: 'This store address is taken.', code: 'slug_taken', suggestion: await suggestFreeSlug(chosenSlug) },
                    { status: 409 },
                );
            }
        }
        const firstSlug = chosenSlug ?? (await ensureUniqueSlug(baseSlug));

        // ── 0. The owner's mobile, proven by a WhatsApp code (B11) ──
        // While the console's switch is on, the store is made only for a
        // number its owner proved; the proof is spent here and given back if
        // the account is not made.
        const signupWhatsApp = await loadSignupWhatsApp(adminClient);
        let verified: { phone: string; proof: string } | null = null;
        if (signupWhatsApp.phone_code) {
            const phone = mobile;
            if (!phone || !phone_proof || !(await spendSignupProof(adminClient, phone_proof, phone))) {
                return NextResponse.json(
                    { error: 'Confirm your WhatsApp number first.', code: 'phone_unverified' },
                    { status: 422 },
                );
            }
            verified = { phone, proof: phone_proof };
        }
        const contact_phone = verified?.phone ?? mobile;
        const giveBackProof = async () => {
            if (verified) await releaseSignupProof(adminClient, verified.proof);
        };

        // ── 1. Create Supabase auth user ──
        // Unconfirmed: the browser then asks Supabase to send the confirm mail, and
        // the account cannot sign in until its owner opens that link. The link is
        // often opened on the owner's phone; the ticket lets the page left open
        // on the computer notice and carry on (/api/auth/signup/wait).
        const waitTicket = newSignupWaitTicket();
        const { data: authData, error: authError } = await adminClient.auth.admin.createUser({
            email,
            password,
            email_confirm: false,
            app_metadata: { signup_wait: waitTicket.hash },
        });

        if (authError) {
            await giveBackProof();
            if (
                authError.code === 'email_exists' ||
                authError.code === 'user_already_exists' ||
                authError.message.includes('already registered') ||
                authError.message.includes('already exists')
            ) {
                return NextResponse.json(
                    { error: 'An account with this email already exists', code: 'email_taken' },
                    { status: 409 }
                );
            }
            // Supabase's password rules (length, letters and digits) and its
            // leaked-password check: the form shows the reason under the field.
            if (isAuthWeakPasswordError(authError)) {
                return NextResponse.json(
                    { error: authError.message, code: 'weak_password', reasons: authError.reasons },
                    { status: 422 },
                );
            }
            return NextResponse.json({ error: authError.message }, { status: 400 });
        }

        const userId = authData.user.id;

        // ── 2. Create tenant ──
        let trialEndsAt = new Date(Date.now() + TRIAL_DAYS * 24 * 60 * 60 * 1000).toISOString();

        // Published from day one so the store's own address shows a designed
        // store, not a blank page. Stamped "signup": the onboarding wizard
        // still runs and seeds the merchant's real choice over it.
        const starterConfig = buildStarterStoreConfigV2({
            templateId: SIGNUP_TEMPLATE_ID,
            packId: packIdFor(business_types) ?? DEFAULT_PACK_ID,
            businessName: business_name,
            whatsappNumber: contact_phone ?? undefined,
            source: 'signup',
        });

        const insertTenant = async (slug: string) => adminClient
            .from('tenants')
            .insert({
                business_name,
                slug,
                plan,
                status: 'trial',
                trial_ends_at: trialEndsAt,
                store_config_v2: starterConfig,
                config_version: 2,
                contact_email: email,
                contact_phone,
                contact_phone_verified_at: verified ? new Date().toISOString() : null,
                city,
                business_types,
                store_config: {
                    template: 'general',
                    hero: {
                        title: business_name,
                        subtitle: '',
                        cta_text: 'تسوق الآن',
                        image_url: null,
                    },
                    contact: {
                        whatsapp_number: contact_phone,
                        instagram: null,
                        facebook: null,
                        tiktok: null,
                    },
                    about: { enabled: false, title: 'من نحن', body: '' },
                    sections_order: ['hero', 'products', 'categories', 'about'],
                    enable_whatsapp_order: true,
                },
            })
            .select()
            .single();

        let created = await insertTenant(firstSlug);
        // An address the merchant chose is never swapped for another; one made
        // from the name moves on to the next free one.
        for (let attempt = 1; chosenSlug === undefined && attempt < SLUG_ATTEMPTS && created.error?.code === UNIQUE_VIOLATION; attempt++) {
            // A failed lookup keeps the unique-violation error, which rolls the user back below.
            const nextSlug = await ensureUniqueSlug(baseSlug).catch((lookupErr: unknown) => {
                reportOrderError(lookupErr, { operation: 'signup-slug-retry' });
                return null;
            });
            if (!nextSlug) break;
            created = await insertTenant(nextSlug);
        }
        const { data: tenant, error: tenantError } = created;

        if (tenantError) {
            // Rollback: delete the auth user
            await adminClient.auth.admin.deleteUser(userId);
            await giveBackProof();
            if (chosenSlug !== undefined && tenantError.code === UNIQUE_VIOLATION) {
                // Another sign-up took the chosen address a moment ago.
                return NextResponse.json(
                    { error: 'This store address is taken.', code: 'slug_taken' },
                    { status: 409 },
                );
            }
            return NextResponse.json(
                { error: `Failed to create tenant: ${tenantError.message}` },
                { status: 500 }
            );
        }

        if (verified) await linkSignupProof(adminClient, verified.proof, tenant.id);

        // ── 3. Create user profile ──
        const { error: profileError } = await adminClient
            .from('user_profiles')
            .insert({
                id: userId,
                email,
                display_name: business_name,
                role: 'admin',
                current_tenant_id: tenant.id,
            });

        if (profileError) {
            // Rollback
            await adminClient.auth.admin.deleteUser(userId);
            await adminClient.from('tenants').delete().eq('id', tenant.id);
            await giveBackProof();
            return NextResponse.json(
                { error: `Failed to create user profile: ${profileError.message}` },
                { status: 500 }
            );
        }

        // If any of the steps below fail, the store is still made.
        let partialFailure = false;
        const setupErrors: string[] = [];

        // ── 3b. A weak password is kept; its owner is asked for a stronger one in a week ──
        // The account works without it, so a failure is reported, not a reason to hold the store.
        if (passwordIsWeak(password)) {
            try {
                await recordPasswordStrength(adminClient, userId, password);
            } catch (reminderError) {
                reportOrderError(reminderError, { operation: 'signup-password-reminder', tenantId: tenant.id });
                setupErrors.push('password_reminders');
            }
        }

        // ── 4-7. Create supporting records (tenant_members, subscription, wallet, usage_tracking) ──
        // If any of these fail, mark the tenant as 'incomplete' for admin review.
        // We don't rollback — the user + tenant are already created and valuable.
        try {
            // ── 4. Create tenant membership ──
            const { error: memberError } = await adminClient
                .from('tenant_members')
                .insert({
                    tenant_id: tenant.id,
                    user_id: userId,
                    role: 'admin',
                    status: 'active',
                    joined_at: new Date().toISOString(),
                });

            if (memberError) {
                throw new Error(`tenant_members: ${memberError.message}`);
            }

            // The one-trial check (Fermi B5) runs in the database when the
            // store and its owner are written, and may already have ended this
            // trial: the subscription follows the store's real trial end.
            const { data: trialRow, error: trialError } = await adminClient
                .from('tenants')
                .select('trial_ends_at')
                .eq('id', tenant.id)
                .single();
            if (trialError) {
                throw new Error(`trial end: ${trialError.message}`);
            }
            trialEndsAt = trialRow.trial_ends_at ?? trialEndsAt;

            // ── 5. Create initial subscription (trial) ──
            const { error: subError } = await adminClient
                .from('subscriptions')
                .insert({
                    tenant_id: tenant.id,
                    plan,
                    status: 'trialing',
                    current_period_start: new Date().toISOString(),
                    current_period_end: trialEndsAt,
                });

            if (subError) {
                throw new Error(`subscription: ${subError.message}`);
            }

            // ── 6. Initialize wallet with zero balance ──
            const { error: walletError } = await adminClient
                .from('wallet')
                .insert({
                    tenant_id: tenant.id,
                    balance_iqd: 0,
                    threshold_iqd: 5000,
                });

            if (walletError) {
                throw new Error(`wallet: ${walletError.message}`);
            }

            // ── 7. Initialize usage tracking for current month ──
            const now = new Date();
            const { error: usageError } = await adminClient
                .from('usage_tracking')
                .upsert({
                    tenant_id: tenant.id,
                    year: now.getFullYear(),
                    month: now.getMonth() + 1,
                    orders_count: 0,
                    orders_charged: 0,
                    team_members_count: 1,
                }, { onConflict: 'tenant_id, year, month', ignoreDuplicates: true });

            if (usageError) {
                throw new Error(`usage_tracking: ${usageError.message}`);
            }
        } catch (setupErr) {
            partialFailure = true;
            const errMsg = setupErr instanceof Error ? setupErr.message : 'Unknown setup error';
            setupErrors.push(errMsg);
            console.error('[Signup] Partial failure during tenant setup:', errMsg);

            // Mark tenant as incomplete for admin review
            await adminClient
                .from('tenants')
                .update({ status: 'incomplete' })
                .eq('id', tenant.id);
        }

        // ── 8. Starter attributes for what the store sells (B10) ──
        // A clothing shop opens its attributes screen to a size chart, a
        // furniture shop to its dimensions. Keys the onboarding wizard seeds
        // later are skipped there, never doubled. The store works without
        // them and the merchant can add the same set on the attributes
        // screen, so a failure is reported, not a reason to hold the store.
        const starterAttributes = mergeAttributeSets(
            ...attributeTemplatesFor(business_types).map((template) => template.attributes),
        );
        if (starterAttributes.length > 0) {
            const { error: attributesError } = await adminClient
                .from('product_attribute_defs')
                .upsert(
                    starterAttributes.map((attribute) => ({ ...attribute, tenant_id: tenant.id })),
                    { onConflict: 'tenant_id,key', ignoreDuplicates: true },
                );
            if (attributesError) {
                reportOrderError(new Error(`Starter attributes not saved: ${attributesError.message}`), {
                    operation: 'signup-starter-attributes',
                    tenantId: tenant.id,
                });
                setupErrors.push(`product_attribute_defs: ${attributesError.message}`);
            }
        }

        // ── 9. Welcome on WhatsApp (B11) ──
        // To the proven number only, after the response: the merchant is not
        // kept waiting on WhatsApp, and a failed send is reported, never a
        // reason to fail the signup.
        const welcomeVideo = signupWhatsApp.welcome ? signupWhatsApp.welcome_video_url : null;
        if (verified && welcomeVideo) {
            const welcome = {
                proof: verified.proof,
                tenantId: tenant.id,
                phone: verified.phone,
                businessName: business_name,
                storeUrl: buildStorefrontUrl({
                    slug: tenant.slug,
                    customDomain: null,
                    rootDomain: env.NEXT_PUBLIC_STOREFRONT_ROOT_DOMAIN,
                    hostname: request.nextUrl.host,
                }),
                videoUrl: welcomeVideo,
            };
            after(() => sendSignupWelcome(adminClient, welcome));
        }

        return NextResponse.json({
            success: true,
            partial_failure: partialFailure || undefined,
            setup_errors: setupErrors.length > 0 ? setupErrors : undefined,
            user_id: userId,
            tenant_id: tenant.id,
            tenant_slug: tenant.slug,
            trial_ends_at: trialEndsAt,
            confirm_email: true,
            wait_ticket: waitTicket.ticket,
            message: partialFailure
                ? `Account created but some setup steps failed. An admin will review your account shortly.`
                : `Account created! You have a ${TRIAL_DAYS}-day free trial.`,
        }, { status: 201 });

    } catch (err) {
        console.error('[Signup] Unexpected error:', err);
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
        );
    }
}

export const POST = withFailureReport("api/auth/signup POST", handlePOST);
