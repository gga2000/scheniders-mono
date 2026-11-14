import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createSupabaseServiceClient } from '@/lib/supabase-server';
import { generateSlug, ensureUniqueSlug } from '@/lib/tenant';
import { consumeRateLimit, rateLimitHeaders } from '@/lib/rate-limit';
import { reportOrderError } from '@/lib/order-telemetry';
import { verifyTurnstile } from '@/lib/turnstile';
import { buildStarterStoreConfigV2, SIGNUP_TEMPLATE_ID } from '@/lib/starter-store';
import { DEFAULT_PACK_ID } from '@/lib/store-templates/content-packs';
import { withFailureReport } from "@/lib/job-monitor";

/**
 * Every self-serve signup starts a trial on the one plan (Ali, 9 Nov): 7 days
 * or 50 orders, whichever comes first. The 50-order end is enforced in the
 * database (end_trial_at_order_cap). The plan is never taken from the request.
 */
const TRIAL_PLAN = 'starter';
const TRIAL_DAYS = 7;

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
    contact_phone: optionalText,
    city: optionalText,
    captcha_token: z.string().optional(),
});

// Two sign-ups picking the same free slug at once: the loser's insert hits the
// unique index, and the next lookup sees the winner and picks the next slug.
const SLUG_ATTEMPTS = 3;
const UNIQUE_VIOLATION = '23505';

function clientIp(request: NextRequest): string {
    const real = request.headers.get('x-real-ip');
    if (real) return real.trim();
    return request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
}

// =============================================
// POST /api/auth/signup
// Creates a new tenant + user account
// =============================================

async function handlePOST(request: NextRequest) {
    try {
        const ip = clientIp(request);
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
            return NextResponse.json(
                { error: parsed.error.issues[0]?.message ?? 'Invalid sign-up details' },
                { status: 400 },
            );
        }
        const { email, password, business_name, contact_phone, city, captcha_token } = parsed.data;

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

        // The store's slug is chosen before any account exists: ensureUniqueSlug
        // throws when its lookup fails, and failing here leaves nothing behind.
        const baseSlug = generateSlug(business_name);
        const firstSlug = await ensureUniqueSlug(baseSlug);

        // ── 1. Create Supabase auth user ──
        // Unconfirmed: the browser then asks Supabase to send the confirm mail, and
        // the account cannot sign in until its owner opens that link.
        const { data: authData, error: authError } = await adminClient.auth.admin.createUser({
            email,
            password,
            email_confirm: false,
        });

        if (authError) {
            if (authError.message.includes('already registered') || authError.message.includes('already exists')) {
                return NextResponse.json(
                    { error: 'An account with this email already exists' },
                    { status: 409 }
                );
            }
            return NextResponse.json({ error: authError.message }, { status: 400 });
        }

        const userId = authData.user.id;

        // ── 2. Create tenant ──
        const trialEndsAt = new Date(Date.now() + TRIAL_DAYS * 24 * 60 * 60 * 1000).toISOString();

        // Published from day one so the store's own address shows a designed
        // store, not a blank page. Stamped "signup": the onboarding wizard
        // still runs and seeds the merchant's real choice over it.
        const starterConfig = buildStarterStoreConfigV2({
            templateId: SIGNUP_TEMPLATE_ID,
            packId: DEFAULT_PACK_ID,
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
                city,
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
        for (let attempt = 1; attempt < SLUG_ATTEMPTS && created.error?.code === UNIQUE_VIOLATION; attempt++) {
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
            return NextResponse.json(
                { error: `Failed to create tenant: ${tenantError.message}` },
                { status: 500 }
            );
        }

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
            return NextResponse.json(
                { error: `Failed to create user profile: ${profileError.message}` },
                { status: 500 }
            );
        }

        // ── 4-7. Create supporting records (tenant_members, subscription, wallet, usage_tracking) ──
        // If any of these fail, mark the tenant as 'incomplete' for admin review.
        // We don't rollback — the user + tenant are already created and valuable.
        let partialFailure = false;
        const setupErrors: string[] = [];

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

        return NextResponse.json({
            success: true,
            partial_failure: partialFailure || undefined,
            setup_errors: setupErrors.length > 0 ? setupErrors : undefined,
            user_id: userId,
            tenant_id: tenant.id,
            tenant_slug: tenant.slug,
            trial_ends_at: trialEndsAt,
            confirm_email: true,
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
