import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServiceClient } from '@/lib/supabase-server';
import { generateSlug, ensureUniqueSlug } from '@/lib/tenant';

// =============================================
// POST /api/auth/signup
// Creates a new tenant + user account
// =============================================

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { email, password, business_name, contact_phone, plan = 'starter', city } = body;

        // Validate required fields
        if (!email || !password || !business_name) {
            return NextResponse.json(
                { error: 'email, password, and business_name are required' },
                { status: 400 }
            );
        }

        if (password.length < 8) {
            return NextResponse.json(
                { error: 'Password must be at least 8 characters' },
                { status: 400 }
            );
        }

        const validPlans = ['starter', 'growth', 'professional', 'enterprise'];
        if (!validPlans.includes(plan)) {
            return NextResponse.json(
                { error: 'Invalid plan. Choose: starter, growth, professional, enterprise' },
                { status: 400 }
            );
        }

        const adminClient = createSupabaseServiceClient();

        // ── 1. Create Supabase auth user ──
        const { data: authData, error: authError } = await adminClient.auth.admin.createUser({
            email: email.trim().toLowerCase(),
            password,
            email_confirm: true, // Auto-confirm for now (can add email verification later)
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
        const baseSlug = generateSlug(business_name);
        const slug = await ensureUniqueSlug(baseSlug);
        const trialEndsAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(); // 14 days

        const { data: tenant, error: tenantError } = await adminClient
            .from('tenants')
            .insert({
                business_name: business_name.trim(),
                slug,
                plan,
                status: 'trial',
                trial_ends_at: trialEndsAt,
                contact_email: email.trim().toLowerCase(),
                contact_phone: contact_phone?.trim() ?? null,
                city: city?.trim() ?? null,
            })
            .select()
            .single();

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
                email: email.trim().toLowerCase(),
                display_name: business_name.trim(),
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
            console.error('[Signup] Failed to create tenant member:', memberError);
            // Non-fatal — profile + tenant are created, this can be repaired
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
            console.error('[Signup] Failed to create subscription:', subError);
            // Non-fatal
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
            console.error('[Signup] Failed to create wallet:', walletError);
            // Non-fatal
        }

        // ── 7. Initialize usage tracking for current month ──
        const now = new Date();
        await adminClient
            .from('usage_tracking')
            .insert({
                tenant_id: tenant.id,
                year: now.getFullYear(),
                month: now.getMonth() + 1,
                orders_count: 0,
                orders_charged: 0,
                team_members_count: 1,
            })
            .onConflict('tenant_id, year, month')
            .ignore();

        return NextResponse.json({
            success: true,
            user_id: userId,
            tenant_id: tenant.id,
            tenant_slug: tenant.slug,
            trial_ends_at: trialEndsAt,
            message: `Account created! You have a 14-day free trial on the ${plan} plan.`,
        }, { status: 201 });

    } catch (err) {
        console.error('[Signup] Unexpected error:', err);
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
        );
    }
}
