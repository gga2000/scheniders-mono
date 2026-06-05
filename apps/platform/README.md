# Schenider Team - Order Management System 🛍️

A high-performance Order Management System for a perfume business in Iraq, built with modern web technologies and the "Midnight Glass" design system.

## 🎨 Design System: "Midnight Glass"

- **Base:** Deep Dark Mode (`#09090b` - zinc-950)
- **Cards/Surfaces:** Glassmorphism with backdrop blur
- **Primary Action:** Neon Emerald (`#10b981`) - WhatsApp/Confirm
- **Destructive:** Neon Rose (`#f43f5e`) - Reject
- **Financial:** Liquid Gold (`#fbbf24`) - Revenue
- **Typography:** Geist Sans (text) & Geist Mono (data)
- **Vibe:** Technical, high-density, clean "Command Center"

## 🛠️ Tech Stack

- **Framework:** Next.js 16 (App Router)
- **Language:** TypeScript
- **Styling:** Tailwind CSS v4
- **UI Components:** Shadcn UI
- **Icons:** Lucide React
- **Backend/DB:** Supabase
- **Animation:** Framer Motion
- **Bundler:** Turbopack

## 🚀 Quick Start

### 1. Install Dependencies

```bash
pnpm install
```

### 2. Set Up Environment Variables

Create a `.env.local` file in the root directory:

```env
NEXT_PUBLIC_SUPABASE_URL=your_supabase_project_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
```

### 3. Set Up Supabase Database

1. Go to your [Supabase Dashboard](https://app.supabase.com/)
2. Create a new project or select an existing one
3. Navigate to the SQL Editor
4. Copy and paste the entire content of `supabase-schema.sql`
5. Run the SQL script to create tables, indexes, and policies

### 4. Run Development Server

```bash
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## 📁 Project Structure

```
scheniders/
├── app/                    # Next.js App Router
│   ├── globals.css        # Global styles + Tailwind config
│   ├── layout.tsx         # Root layout
│   └── page.tsx           # Home page
├── lib/                   # Core utilities
│   ├── supabase.ts       # Supabase client & types
│   └── utils.ts          # Helper functions
├── components/           # React components (to be created)
├── public/              # Static assets
├── supabase-schema.sql  # Database schema
├── tailwind.config.ts   # Tailwind configuration
└── package.json         # Dependencies
```

## 🗄️ Database Schema

### Orders Table

Stores all order information from LightFunnels:

- `id` - UUID primary key
- `order_id` - Unique order ID from LightFunnels
- `customer_name` - Customer name
- `phone` - Phone number
- `city` - City name
- `governorate_code` - Governorate code
- `address_details` - Full address
- `items` - JSONB array of products
- `price` - Total order price
- `status` - Order status (new/contacted/confirmed/rejected/delivered)
- `whatsapp_link` - WhatsApp contact link
- `notes` - Additional notes
- `rejection_reason` - Reason for rejection (if applicable)

### Blacklist Table

Stores blocked phone numbers:

- `phone` - Phone number (primary key)
- `reason` - Reason for blacklisting
- `created_at` - Timestamp
- `added_by` - Who added to blacklist
- `notes` - Additional notes

## 🎯 Features (To Be Implemented)

- [ ] Order Dashboard with real-time updates
- [ ] Order status workflow management
- [ ] WhatsApp integration for customer contact
- [ ] Inventory management
- [ ] Financial reporting & analytics
- [ ] Customer blacklist management
- [ ] Multi-governorate shipping tracking
- [ ] Print labels & invoices

## 🔧 Development

### Build for Production

```bash
pnpm build
pnpm start
```

### Linting

```bash
pnpm lint
```

## 📝 Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `NEXT_PUBLIC_SUPABASE_URL` | Your Supabase project URL | Yes |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Your Supabase anonymous key | Yes |

## 🎨 Using the Design System

The Midnight Glass design system is configured in `app/globals.css` using Tailwind CSS v4's `@theme` directive.

### Example Usage

```tsx
// Glass card with hover effect
<div className="glass-card p-6 hover:border-border-hover">
  <h2 className="font-mono text-financial">75,000 IQD</h2>
  <button className="bg-primary hover:bg-primary-hover text-primary-foreground">
    Confirm Order
  </button>
</div>
```

### Available CSS Variables

- `--color-primary` - Neon Emerald (#10b981)
- `--color-destructive` - Neon Rose (#f43f5e)
- `--color-financial` - Liquid Gold (#fbbf24)
- `--color-surface` - Glass surface (rgba)
- `--color-border` - Border color (rgba)
- And many more in `globals.css`

## 📦 Key Dependencies

- `next@16.0.10` - React framework
- `@supabase/supabase-js` - Database client
- `framer-motion` - Animations
- `lucide-react` - Icons
- `tailwindcss@4` - Styling
- Radix UI components for accessible UI primitives

## 🤝 Contributing

1. Create a feature branch
2. Make your changes
3. Test thoroughly
4. Submit a pull request

## 📄 License

Private - Schenider Team Internal Use Only

---

Built with ❤️ for Schenider Team
