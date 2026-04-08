"use client";

import { useState } from "react";
import Link from "next/link";
import {
    Package,
    BarChart3,
    Users,
    Truck,
    MessageCircle,
    Shield,
    Printer,
    Globe,
    Check,
    ArrowRight,
    Zap,
    Crown,
    Star,
    ChevronDown,
} from "lucide-react";
import { cn } from "@/lib/utils";

// =============================================
// PLAN DATA
// =============================================

const PLANS = [
    {
        name: "Starter",
        price: "10,000",
        period: "/mo",
        description: "For small shops just getting started",
        color: "blue",
        features: [
            "500 orders/month",
            "3 team members",
            "Order management",
            "Customer tracking",
            "Basic analytics",
            "Print labels",
        ],
        cta: "Start Free Trial",
        popular: false,
    },
    {
        name: "Growth",
        price: "30,000",
        period: "/mo",
        description: "For growing businesses scaling up",
        color: "green",
        features: [
            "2,000 orders/month",
            "8 team members",
            "Everything in Starter",
            "WhatsApp automation",
            "Advanced analytics",
            "Priority support",
        ],
        cta: "Start Free Trial",
        popular: true,
    },
    {
        name: "Professional",
        price: "70,000",
        period: "/mo",
        description: "For established businesses",
        color: "purple",
        features: [
            "10,000 orders/month",
            "20 team members",
            "Everything in Growth",
            "API access",
            "Custom branding",
            "Custom storefront",
        ],
        cta: "Start Free Trial",
        popular: false,
    },
    {
        name: "Enterprise",
        price: "100,000",
        period: "/mo",
        description: "Unlimited everything",
        color: "amber",
        features: [
            "Unlimited orders",
            "Unlimited team members",
            "Everything in Professional",
            "Dedicated support",
            "Custom integrations",
            "SLA guarantee",
        ],
        cta: "Contact Sales",
        popular: false,
    },
];

const FEATURES = [
    {
        icon: Package,
        title: "Order Management",
        description: "Track orders from creation to delivery. Status updates, notes, and full history.",
        color: "bg-blue-100 text-blue-700",
    },
    {
        icon: BarChart3,
        title: "Real-time Analytics",
        description: "Revenue trends, delivery rates, peak hours, city breakdowns and forecasts.",
        color: "bg-purple-100 text-purple-700",
    },
    {
        icon: Users,
        title: "Customer Intelligence",
        description: "Customer profiles, order history, tags, risk scoring, and blacklist management.",
        color: "bg-green-100 text-green-700",
    },
    {
        icon: Truck,
        title: "Delivery Integration",
        description: "Direct integration with Al-Waseet and other Iraqi delivery companies.",
        color: "bg-amber-100 text-amber-700",
    },
    {
        icon: MessageCircle,
        title: "WhatsApp Automation",
        description: "Auto-send order confirmations, shipping updates, and follow-ups via WhatsApp.",
        color: "bg-teal-100 text-teal-700",
    },
    {
        icon: Shield,
        title: "Team & Permissions",
        description: "Invite team members with role-based access. Admin, manager, support, logistics.",
        color: "bg-rose-100 text-rose-700",
    },
    {
        icon: Printer,
        title: "Label Printing",
        description: "Batch print shipping labels in 4x6 or A4 format. Customizable templates.",
        color: "bg-indigo-100 text-indigo-700",
    },
    {
        icon: Globe,
        title: "Multi-city Coverage",
        description: "All 18 Iraqi governorates supported. City-based delivery fees and analytics.",
        color: "bg-orange-100 text-orange-700",
    },
];

const FAQS = [
    {
        q: "How does the free trial work?",
        a: "You get 14 days of full access on any plan. No credit card required. At the end of your trial, choose a plan and top up your wallet to continue.",
    },
    {
        q: "How does billing work?",
        a: "We use a prepaid wallet system. You top up your wallet balance, and we charge a small per-order fee (100 IQD/order). Your monthly base fee is deducted from your wallet at the start of each billing period.",
    },
    {
        q: "Can I change plans later?",
        a: "Yes! You can upgrade or downgrade your plan at any time from your billing settings. Upgrades take effect immediately, downgrades at the end of your current billing period.",
    },
    {
        q: "What payment methods do you accept?",
        a: "We accept ZainCash, Qi Card, and bank transfers. More payment methods coming soon.",
    },
    {
        q: "Is my data secure?",
        a: "Absolutely. Each business gets complete data isolation — you can only see your own orders, customers, and analytics. We use bank-grade encryption and row-level security.",
    },
    {
        q: "Can I import my existing orders?",
        a: "Yes! You can import orders, products, and customer data via CSV during onboarding or anytime from settings.",
    },
];

// =============================================
// COMPONENTS
// =============================================

function FAQItem({ q, a }: { q: string; a: string }) {
    const [open, setOpen] = useState(false);
    return (
        <div className="border-b border-gray-200 last:border-0">
            <button
                onClick={() => setOpen(!open)}
                className="w-full flex items-center justify-between py-5 text-left"
            >
                <span className="font-medium text-gray-900">{q}</span>
                <ChevronDown className={cn("w-5 h-5 text-gray-400 transition-transform", open && "rotate-180")} />
            </button>
            {open && (
                <p className="pb-5 text-gray-600 text-sm leading-relaxed">{a}</p>
            )}
        </div>
    );
}

// =============================================
// PAGE
// =============================================

export default function LandingPage() {
    return (
        <div className="min-h-screen bg-white text-gray-900">
            {/* Navigation */}
            <nav className="sticky top-0 z-50 bg-white/80 backdrop-blur-xl border-b border-gray-100">
                <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-600 to-purple-600 flex items-center justify-center">
                            <span className="text-white font-bold text-sm">S</span>
                        </div>
                        <span className="font-bold text-xl">Scheniders</span>
                    </div>
                    <div className="hidden md:flex items-center gap-8 text-sm">
                        <a href="#features" className="text-gray-600 hover:text-gray-900 transition-colors">Features</a>
                        <a href="#pricing" className="text-gray-600 hover:text-gray-900 transition-colors">Pricing</a>
                        <a href="#faq" className="text-gray-600 hover:text-gray-900 transition-colors">FAQ</a>
                    </div>
                    <div className="flex items-center gap-3">
                        <Link href="/login" className="text-sm font-medium text-gray-700 hover:text-gray-900 transition-colors px-4 py-2">
                            Log in
                        </Link>
                        <Link href="/signup" className="text-sm font-medium bg-gray-900 text-white px-5 py-2 rounded-xl hover:bg-gray-800 transition-colors">
                            Start Free Trial
                        </Link>
                    </div>
                </div>
            </nav>

            {/* Hero */}
            <section className="pt-20 pb-24 px-6">
                <div className="max-w-4xl mx-auto text-center">
                    <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-blue-50 text-blue-700 text-sm font-medium mb-6">
                        <Zap className="w-4 h-4" />
                        14-day free trial — no credit card required
                    </div>
                    <h1 className="text-5xl md:text-6xl font-bold tracking-tight leading-[1.1] mb-6">
                        The order management
                        <br />
                        <span className="bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
                            platform for Iraq
                        </span>
                    </h1>
                    <p className="text-xl text-gray-600 max-w-2xl mx-auto mb-10 leading-relaxed">
                        Everything you need to manage orders, track customers, automate WhatsApp,
                        and grow your e-commerce business. Built for Iraqi merchants.
                    </p>
                    <div className="flex items-center justify-center gap-4">
                        <Link
                            href="/signup"
                            className="inline-flex items-center gap-2 bg-gray-900 text-white px-8 py-3.5 rounded-xl font-semibold text-lg hover:bg-gray-800 transition-all hover:scale-[1.02] shadow-lg shadow-gray-900/20"
                        >
                            Get Started Free
                            <ArrowRight className="w-5 h-5" />
                        </Link>
                        <a
                            href="#features"
                            className="inline-flex items-center gap-2 px-8 py-3.5 rounded-xl font-semibold text-lg border border-gray-200 text-gray-700 hover:bg-gray-50 transition-all"
                        >
                            See Features
                        </a>
                    </div>

                    {/* Social proof */}
                    <div className="mt-14 flex items-center justify-center gap-6 text-sm text-gray-500">
                        <div className="flex items-center gap-1">
                            {[...Array(5)].map((_, i) => (
                                <Star key={i} className="w-4 h-4 fill-amber-400 text-amber-400" />
                            ))}
                        </div>
                        <span>Trusted by Iraqi e-commerce businesses</span>
                    </div>
                </div>
            </section>

            {/* Features */}
            <section id="features" className="py-20 px-6 bg-gray-50">
                <div className="max-w-6xl mx-auto">
                    <div className="text-center mb-14">
                        <h2 className="text-3xl md:text-4xl font-bold mb-4">Everything you need to manage orders</h2>
                        <p className="text-lg text-gray-600 max-w-2xl mx-auto">
                            From order creation to delivery tracking, customer management to analytics —
                            all in one powerful platform.
                        </p>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
                        {FEATURES.map((feature) => {
                            const Icon = feature.icon;
                            return (
                                <div
                                    key={feature.title}
                                    className="bg-white rounded-2xl p-6 border border-gray-100 hover:border-gray-200 hover:shadow-lg transition-all group"
                                >
                                    <div className={cn("w-11 h-11 rounded-xl flex items-center justify-center mb-4 transition-transform group-hover:scale-110", feature.color)}>
                                        <Icon className="w-5 h-5" />
                                    </div>
                                    <h3 className="font-semibold text-lg mb-2">{feature.title}</h3>
                                    <p className="text-sm text-gray-600 leading-relaxed">{feature.description}</p>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </section>

            {/* Pricing */}
            <section id="pricing" className="py-20 px-6">
                <div className="max-w-6xl mx-auto">
                    <div className="text-center mb-14">
                        <h2 className="text-3xl md:text-4xl font-bold mb-4">Simple, transparent pricing</h2>
                        <p className="text-lg text-gray-600 max-w-2xl mx-auto">
                            Start free for 14 days. All plans include 100 IQD per order charge.
                            No hidden fees.
                        </p>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
                        {PLANS.map((plan) => (
                            <div
                                key={plan.name}
                                className={cn(
                                    "relative bg-white rounded-2xl p-6 border-2 transition-all hover:shadow-lg",
                                    plan.popular
                                        ? "border-green-500 shadow-lg shadow-green-500/10"
                                        : "border-gray-100 hover:border-gray-200"
                                )}
                            >
                                {plan.popular && (
                                    <div className="absolute -top-3 left-1/2 -translate-x-1/2 inline-flex items-center gap-1 bg-green-600 text-white text-xs font-semibold px-3 py-1 rounded-full">
                                        <Crown className="w-3 h-3" />
                                        Most Popular
                                    </div>
                                )}

                                <div className="mb-5">
                                    <h3 className="font-bold text-lg">{plan.name}</h3>
                                    <p className="text-sm text-gray-500 mt-1">{plan.description}</p>
                                </div>

                                <div className="mb-6">
                                    <span className="text-3xl font-bold">{plan.price}</span>
                                    <span className="text-gray-500 text-sm"> IQD{plan.period}</span>
                                </div>

                                <ul className="space-y-3 mb-6">
                                    {plan.features.map((feature) => (
                                        <li key={feature} className="flex items-start gap-2 text-sm">
                                            <Check className="w-4 h-4 text-green-600 mt-0.5 shrink-0" />
                                            <span>{feature}</span>
                                        </li>
                                    ))}
                                </ul>

                                <Link
                                    href="/signup"
                                    className={cn(
                                        "block w-full text-center py-2.5 rounded-xl font-medium text-sm transition-all",
                                        plan.popular
                                            ? "bg-green-600 text-white hover:bg-green-700"
                                            : "bg-gray-100 text-gray-900 hover:bg-gray-200"
                                    )}
                                >
                                    {plan.cta}
                                </Link>
                            </div>
                        ))}
                    </div>

                    {/* Per-order pricing note */}
                    <div className="mt-8 text-center">
                        <p className="text-sm text-gray-500">
                            All plans include a per-order charge of <span className="font-semibold">100 IQD</span> per order
                            (500 IQD for orders beyond your plan limit). Charged from your prepaid wallet.
                        </p>
                    </div>
                </div>
            </section>

            {/* FAQ */}
            <section id="faq" className="py-20 px-6 bg-gray-50">
                <div className="max-w-2xl mx-auto">
                    <div className="text-center mb-12">
                        <h2 className="text-3xl font-bold mb-4">Frequently asked questions</h2>
                        <p className="text-gray-600">Everything you need to know about Scheniders.</p>
                    </div>

                    <div className="bg-white rounded-2xl border border-gray-100 px-6">
                        {FAQS.map((faq) => (
                            <FAQItem key={faq.q} q={faq.q} a={faq.a} />
                        ))}
                    </div>
                </div>
            </section>

            {/* CTA */}
            <section className="py-20 px-6">
                <div className="max-w-3xl mx-auto text-center">
                    <h2 className="text-3xl md:text-4xl font-bold mb-4">
                        Ready to grow your business?
                    </h2>
                    <p className="text-lg text-gray-600 mb-8">
                        Join Iraqi merchants who trust Scheniders to manage their orders.
                        Start your 14-day free trial today.
                    </p>
                    <Link
                        href="/signup"
                        className="inline-flex items-center gap-2 bg-gray-900 text-white px-8 py-3.5 rounded-xl font-semibold text-lg hover:bg-gray-800 transition-all hover:scale-[1.02] shadow-lg shadow-gray-900/20"
                    >
                        Start Free Trial
                        <ArrowRight className="w-5 h-5" />
                    </Link>
                </div>
            </section>

            {/* Footer */}
            <footer className="border-t border-gray-100 py-10 px-6">
                <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
                    <div className="flex items-center gap-2">
                        <div className="w-6 h-6 rounded-md bg-gradient-to-br from-blue-600 to-purple-600 flex items-center justify-center">
                            <span className="text-white font-bold text-xs">S</span>
                        </div>
                        <span className="font-semibold">Scheniders</span>
                    </div>
                    <p className="text-sm text-gray-500">
                        &copy; {new Date().getFullYear()} Scheniders. All rights reserved.
                    </p>
                </div>
            </footer>
        </div>
    );
}
