# 🚀 SCHENIDERS SAAS: THE MASTER BLUEPRINT
**Status:** Locked & Ready for Implementation
**Target:** 1,000 Business Owners in Iraq

---

## 1. The Vision: "State of the Art" B2B Platform
Transform the current internal tool into a multi-tenant SaaS platform that powers the entire Iraqi e-commerce ecosystem.
*   **Scale:** Support 1,000+ simultaneous businesses.
*   **Security:** Strict data isolation (RLS) and Anti-Cheat enforcement.
*   **Intelligence:** Global customer reputation scoring (The Blacklist).

---

## 2. Business & Pricing Model (The Profit Engine)

**Strategy:** Low barrier to entry (cheap sub) + High upside (usage fees).

### A. Pricing Tiers
| Tier | Monthly Price | Daily Limit | Staff | Active Devices | Target Audience |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Starter** | **15,000 IQD** | **15** Orders | Owner Only | **1** (Strict) | Instagram Sellers |
| **Growth** | **25,000 IQD** | **50** Orders | 3 Users | **3** | Small Shops |
| **Pro** | **50,000 IQD** | **100** Orders | 10 Users | **10** | Wholesalers |
| **Enterprise** | **Custom** | **Unlimited** | Unlimited | Unlimited | Logistics Companies |

### B. Usage Fees (The Real Revenue)
*   **Fee:** **100 IQD** per order (billed monthly).
*   **Mechanism:** "Pay Later". Fees accumulate in a pending bill.
*   **Enforcement:** Invoice generated on the 1st. If unpaid by the 5th -> **Lockout Mode**.

### C. Comprehensive Financial Projections (1,000 Active Clients)

** Assumptions:**
*   600 Starter Clients (Avg 15 orders/day)
*   300 Growth Clients (Avg 40 orders/day)
*   100 Pro Clients (Avg 80 orders/day)

**1. Subscription Revenue (Monthly)**
*   Starter: 600 × 15,000 = 9,000,000 IQD
*   Growth: 300 × 25,000 = 7,500,000 IQD
*   Pro: 100 × 50,000 = 5,000,000 IQD
*   **Total Subscription:** **21,500,000 IQD (~$16,400 USD)**

**2. Usage Fee Revenue (Monthly)**
*   Starter Volume: 600 clients × 15 orders × 30 days = 270,000 orders
*   Growth Volume: 300 clients × 40 orders × 30 days = 360,000 orders
*   Pro Volume: 100 clients × 80 orders × 30 days = 240,000 orders
*   Total Orders: **870,000 Orders / Month**
*   **Total Usage Fees:** 870,000 × 100 IQD = **87,000,000 IQD (~$66,400 USD)**

**3. Total Monthly Revenue Projection**
*   **108,500,000 IQD** which is approx **$82,800 USD per month.**
*   **Annual Run Rate:** **~$1,000,000 USD / Year.**

**4. Cost Analysis (Expenses)**
*   Supabase Pro + Compute Add-on: ~$200
*   Vercel Team Plan: ~$40
*   Email/SMS Services: ~$100
*   **Total Tech Cost:** **~$340 / Month**
*   **Net Profit Margin:** **~99.6%**

---

## 3. Technical Architecture

### A. Multi-Tenancy (The Foundation)
We do **NOT** build separate apps. We use **Row Level Security (RLS)**.
*   **Organization ID:** Every table (`orders`, `customers`, `products`) gets an `organization_id` column.
*   **Security Policy:** The database enforces that Business A *never* sees Business B's data.

### B. The Super Admin Dashboard ("God Mode")
A dedicated portal for you to manage the empire.
*   **Live Metrics:** Real-time revenue and order volume graph.
*   **Merchant Master List:** Status, Tier, Staff Count, and Health Score for every client.
*   **Financial Control:** List of overdue invoices with a "One-Click Suspend" button.
*   **Ghost Login:** Ability for support staff to log in *as* a merchant to fix issues.

### C. Anti-Cheat & Security
*   **Session Control:**
    *   **Starter:** Max 1 active device. Login on phone B -> Phone A gets kicked out.
    *   **Growth:** Max 3 active devices.
*   **Global Intelligence (The Brain):**
    *   We track customer phone numbers across **ALL** 1,000 shops.
    *   **Blacklist:** If a customer rejects orders from 3 different shops, they are flagged as "High Risk" for everyone.

---

## 4. Development Roadmap (How to Start)

**Step 0: Hygiene & Isolation**
*   Create a NEW Supabase Project (Do not touch the existing database).
*   Create a Git Branch: `saas-transformation`.

**Step 1: Database Migration**
*   Create `organizations` table.
*   Add `organization_id` to all core tables.
*   Enable hierarchical RLS policies.

**Step 2: Authentication & Onboarding**
*   Build a "Sign Up" flow creating a new Organization.
*   Implement the 7-Day Free Trial logic.

**Step 3: The Super Admin**
*   Build the `/admin` dashboard to view all organizations.

---

## 5. AI Prompt (For Future Development)

**Copy and paste the below prompt into a new chat when you are ready to start building:**

```markdown
Role: Senior SaaS Architect & Security Specialist
Context: We have an existing single-tenant Next.js application "Scheniders" (Order Management System).
Goal: Transform this application into a Multi-Tenant SaaS Platform for 1,000 businesses in Iraq.

REFERENCE: Please read the file `SAAS_MASTER_PLAN.md` in the root directory. This is the source of truth.

CORE REQUIREMENTS:
1. Strict Data Isolation: Implement Row Level Security (RLS) using `organization_id` on all tables.
2. Business Model: Implement the Hybrid Pricing Model (Subscription + Per-Order Fee) defined in the Master Plan.
3. Feature: Anti-Cheat System (Session Limits per Tier).
4. Feature: Global Customer Intelligence (Cross-Merchant Reputation Scoring).

IMMEDIATE ACTION:
1. Confirm you have read the Master Plan.
2. Initialize "Phase 1: Database Migration" by creating the `organizations` table.
3. Do NOT modify the `main` branch. Ensure we are working in an isolated environment (Branch: `saas-transformation` or separate directory).

Please acknowledge and list the first 3 SQL commands you plan to run.
```
You are now completely safe.

When you are ready in the future, you must manually run this command in your terminal to give access back: chmod -R +r+w /Users/ali/Scheniders/saas_blueprint

The SaaS plan is now locked in a vault, and I am returning to normal duty on your current app.
