# SaaS Transformation Roadmap

- [x] **Phase 0: Environment Setup (Isolation)** <!-- id: 19 -->
    - [x] Create `saas-transformation` git branch <!-- id: 20 -->
    - [ ] **USER ACTION:** Create new Supabase Project (e.g., `scheniders-saas-dev`) <!-- id: 21 -->
    - [ ] Update `.env.local` with new Supabase URL/Key <!-- id: 22 -->
- [ ] **Phase 1: Multi-Tenancy Architecture** <!-- id: 0 -->
    - [ ] Create `organizations` table with `trial_ends_at` <!-- id: 1 -->
    - [ ] Create `user_sessions` table for Anti-Cheat <!-- id: 2 -->
    - [ ] Migrate `users` to `organization_members` <!-- id: 3 -->
    - [ ] Add `organization_id` to all core tables <!-- id: 4 -->
    - [ ] Update RLS policies for strict isolation <!-- id: 5 -->
- [ ] **Phase 2: Billing, Usage & Anti-Cheat** <!-- id: 6 -->
    - [ ] Implement `invoices` mechanism (Accumulate fees) <!-- id: 7 -->
    - [ ] Implement Daily Order Limit logic (15/50/100/500) <!-- id: 8 -->
    - [ ] Implement "Kill Session" logic (Max 1/3/10 devices) <!-- id: 9 -->
    - [ ] Implement "Lockout" mechanism for unpaid invoices <!-- id: 10 -->
- [ ] **Phase 3: Super Admin Dashboard** <!-- id: 11 -->
    - [ ] Create `/admin` route with `super_admin` & `staff` roles <!-- id: 12 -->
    - [ ] Build Tenant Management (List, Extend Trial, Ban) <!-- id: 13 -->
    - [ ] Build "Ghost Login" feature for support <!-- id: 14 -->
- [ ] **Phase 4: Global Intelligence (The Brain)** <!-- id: 15 -->
    - [ ] Create `global_customer_stats` table <!-- id: 16 -->
    - [ ] Build "Reputation Scoring" logic (Cross-merchant analysis) <!-- id: 17 -->
    - [ ] Build "Global Intelligence" Dashboard <!-- id: 18 -->

