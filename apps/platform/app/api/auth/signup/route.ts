import { createHash } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { clientIp } from '@/lib/client-ip';
import { env } from '@/lib/env';
import { consumeRateLimit, rateLimitHeaders } from '@/lib/rate-limit';
import { createSupabaseAnonClient, createSupabaseServiceClient } from '@/lib/supabase-server';
import { generateSlug, ensureUniqueSlug, type PlanTier } from '@/lib/tenant';

// =============================================
// POST /api/auth/signup
// Creates a new tenant + user account
// =============================================
//
// Hardened (Phase 4):
// - The plan is decided here, not by the client. Every self-serve signup starts
//   a trial on SIGNUP_PLAN; plan changes go through billing.
// - The email must be confirmed before the account can sign in. The user is
//   created through the public `auth.signUp`, which sends Supabase's
//   confirmation email, instead of `admin.createUser({ email_confirm: true })`,
//   which marked any typed address as verified.
// - Input is validated with Zod.
// - Requests are rate limited per IP and per email (Postgres-backed limiter,
//   lib/rate-limit.ts).
// - Every success answers with the same body, so the endpoint does not reveal
//   whether an email already has an account.

/**
 * Server-decided plan for a self-serve trial: every signup starts its trial on
 * this plan and picks a paid plan later in-app (S3-02a).
 */
const SIGNUP_PLAN: PlanTier = 'growth';
const TRIAL_DAYS = 14;

const IP_LIMIT = 5;
const EMAIL_LIMIT = 3;
const WINDOW_SECONDS = 60 * 60;

const CHECK_EMAIL_MESSAGE =
    'Check your email to confirm your account, then sign in. Your 14-day free trial starts now.';

const optionalText = (max: number) =>
    z.string().trim().max(max).optional().transform(v => (v ? v : null));

const signupSchema = z.object({
    email: z.string().trim().toLowerCase().max(254).pipe(z.email('Enter a valid email address')),
    // 72 bytes is bcrypt's limit; anything longer is silently truncated by it.
    password: z.string().min(8, 'Password must be at least 8 characters').max(72, 'Password must be at most 72 characters'),
    business_name: z.string().trim().min(1, 'business_name is required').max(120),
    contact_phone: optionalText(32),
    city: optionalText(80),
});

function sha256(value: string): string {
    return createHash('sha256').update(value, 'utf8').digest('hex');
}

function accepted() {
    return NextResponse.json({ success: true, message: CHECK_EMAIL_MESSAGE }, { status: 202 });
}

function limiterUnavailable(error: string) {
    // Fails CLOSED, unlike the limiter's default: this endpoint is
    // unauthenticated and creates accounts, tenants and outbound email, so an
    // unthrottled window is worse than a short signup outage.
    console.error('[Signup] Rate limiter unavailable — refusing signup:', error);
    return NextResponse.json(
        { error: 'Signup is temporarily unavailable. Please try again shortly.' },
        { status: 503 },
    );
}

function tooMany(limit: Awaited<ReturnType<typeof consumeRateLimit>>, max: number) {
    return NextResponse.json(
        { error: 'Too many signup attempts. Please try again later.' },
        { status: 429, headers: rateLimitHeaders(limit, max) },
    );
}

export async function POST(request: NextRequest) {
    try {
        const ipLimit = await consumeRateLimit(
            `signup:ip:${clientIp(request.headers) ?? 'unknown'}`,
            IP_LIMIT,
            WINDOW_SECONDS,
        );
        if (ipLimit.error) return limiterUnavailable(ipLimit.error);
        if (!ipLimit.allowed) return tooMany(ipLimit, IP_LIMIT);

        let body: unknown;
        try {
            body = await request.json();
        } catch {
            return NextResponse.json({ error: 'Body is not valid JSON' }, { status: 400 });
        }
        const parsed = signupSchema.safeParse(body);
        if (!parsed.success) {
            return NextResponse.json(
                { error: parsed.error.issues[0]?.message ?? 'Invalid signup details' },
                { status: 400 },
            );
        }
        const { email, password, business_name, contact_phone, city } = parsed.data;

        // Keyed by a hash so the limiter table holds no raw addresses.
        const emailLimit = await consumeRateLimit(`signup:email:${sha256(email)}`, EMAIL_LIMIT, WINDOW_SECONDS);
        if (emailLimit.error) return limiterUnavailable(emailLimit.error);
        if (!emailLimit.allowed) return tooMany(emailLimit, EMAIL_LIMIT);

        const adminClient = createSupabaseServiceClient();

        // The store's slug is chosen before any account exists: ensureUniqueSlug
        // throws when its lookup fails, and failing here leaves nothing behind.
        const baseSlug = generateSlug(business_name);
        const slug = await ensureUniqueSlug(baseSlug);

        // ── 1. Create the auth user (unconfirmed) and send the confirmation email ──
        const origin = env.NEXT_PUBLIC_SITE_URL ?? new URL(request.url).origin;
        const { data: authData, error: authError } = await createSupabaseAnonClient().auth.signUp({
            email,
            password,
            options: { emailRedirectTo: `${origin}/login` },
        });

        if (authError) {
            if (authError.status === 429) {
                return NextResponse.json(
                    { error: 'Too many signup attempts. Please try again later.' },
                    { status: 429 },
                );
            }
            // With confirmations on, Supabase does not error for an existing
            // address; this branch only runs if they are off. Answer the same
            // as a new signup either way.
            if (/already (registered|exists)/i.test(authError.message)) return accepted();
            return NextResponse.json({ error: authError.message }, { status: 400 });
        }

        const user = authData.user;
        if (!user) {
            console.error('[Signup] auth.signUp returned no user and no error');
            return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
        }

        // An address that already has a confirmed account comes back as an
        // obfuscated user with no identities, and nothing was created.
        if (user.identities?.length === 0) return accepted();

        // A session (or a confirmed address) here means the Supabase project
        // has "Confirm email" turned off, so the address would never be
        // verified. Refuse rather than create an unverified owner account.
        if (authData.session || user.email_confirmed_at) {
            console.error(
                '[Signup] Supabase Auth "Confirm email" is disabled — refusing to create an unverified account.',
            );
            await adminClient.auth.admin.deleteUser(user.id);
            return NextResponse.json(
                { error: 'Signup is temporarily unavailable. Please try again shortly.' },
                { status: 503 },
            );
        }

        // An unconfirmed address that signs up again gets the same user back
        // (Supabase resends the email). It is already provisioned; it must not
        // get a second tenant, and the rollback below must never delete it.
        const { data: existingProfile, error: profileLookupError } = await adminClient
            .from('user_profiles')
            .select('id')
            .eq('id', user.id)
            .maybeSingle();
        if (profileLookupError) {
            console.error('[Signup] Profile lookup failed:', profileLookupError.message);
            return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
        }
        if (existingProfile) return accepted();

        const userId = user.id;

        // ── 2. Create tenant ──
        const trialEndsAt = new Date(Date.now() + TRIAL_DAYS * 24 * 60 * 60 * 1000).toISOString();

        const { data: tenant, error: tenantError } = await adminClient
            .from('tenants')
            .insert({
                business_name,
                slug,
                plan: SIGNUP_PLAN,
                status: 'trial',
                trial_ends_at: trialEndsAt,
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

        if (tenantError) {
            // Rollback: delete the auth user
            await adminClient.auth.admin.deleteUser(userId);
            console.error('[Signup] Failed to create tenant:', tenantError.message);
            return NextResponse.json({ error: 'Failed to create your account. Please try again.' }, { status: 500 });
        }

        // ── 3. Create user profile ──
        // `role` here is the owner's role inside their own tenant: the client
        // reads it for navigation and permissions (auth-provider), and every
        // server-side platform-wide check accepts only `super_admin`
        // (lib/permissions.ts isPlatformAdminRole). Tenant access is granted by
        // the tenant_members row below.
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
            console.error('[Signup] Failed to create user profile:', profileError.message);
            return NextResponse.json({ error: 'Failed to create your account. Please try again.' }, { status: 500 });
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

            // ── 5. Create initial subscription (trial) ──
            const { error: subError } = await adminClient
                .from('subscriptions')
                .insert({
                    tenant_id: tenant.id,
                    plan: SIGNUP_PLAN,
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
            const errMsg = setupErr instanceof Error ? setupErr.message : 'Unknown setup error';
            console.error('[Signup] Partial failure during tenant setup:', errMsg);

            // Mark tenant as incomplete for admin review
            await adminClient
                .from('tenants')
                .update({ status: 'incomplete' })
                .eq('id', tenant.id);
        }

        return accepted();
    } catch (err) {
        console.error('[Signup] Unexpected error:', err);
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
        );
    }
}
