"use client";

import { useCallback } from "react";
import { Truck, RefreshCw, Shield } from "lucide-react";
import { cn } from "@/lib/utils";

interface PoliciesEditorProps {
    data: Record<string, unknown>;
    onUpdate: (data: Record<string, unknown>) => void;
}

const POLICY_FIELDS = [
    {
        key: "shipping",
        label: "Shipping Policy",
        labelAr: "سياسة الشحن",
        icon: Truck,
        placeholder: "أدخل سياسة الشحن الخاصة بمتجرك...\n\nمثال:\n- التوصيل خلال 2-5 أيام عمل\n- الشحن مجاني للطلبات فوق 50,000 د.ع\n- التوصيل متاح في جميع المحافظات",
    },
    {
        key: "returns",
        label: "Return Policy",
        labelAr: "سياسة الإرجاع",
        icon: RefreshCw,
        placeholder: "أدخل سياسة الإرجاع الخاصة بمتجرك...\n\nمثال:\n- يمكن إرجاع المنتج خلال 7 أيام\n- يجب أن يكون المنتج بحالته الأصلية\n- يتم استرداد المبلغ خلال 3-5 أيام عمل",
    },
    {
        key: "privacy",
        label: "Privacy Policy",
        labelAr: "سياسة الخصوصية",
        icon: Shield,
        placeholder: "أدخل سياسة الخصوصية الخاصة بمتجرك...\n\nمثال:\n- نحن نحترم خصوصيتك\n- لا يتم مشاركة بياناتك مع أطراف ثالثة\n- يتم حماية معلوماتك الشخصية بتقنيات التشفير",
    },
] as const;

export function PoliciesEditor({ data, onUpdate }: PoliciesEditorProps) {
    const update = useCallback(
        (field: string, value: string) => {
            onUpdate({ ...data, [field]: value });
        },
        [data, onUpdate]
    );

    return (
        <div className="space-y-4">
            {POLICY_FIELDS.map(({ key, label, labelAr, icon: Icon, placeholder }) => (
                <div key={key}>
                    <div className="flex items-center gap-2 mb-2">
                        <Icon className="w-4 h-4 text-muted-foreground" />
                        <span className="text-xs font-medium">{label}</span>
                        <span className="text-[10px] text-muted-foreground">{labelAr}</span>
                    </div>
                    <textarea
                        value={(data[key] as string) || ""}
                        onChange={(e) => update(key, e.target.value)}
                        rows={5}
                        className="w-full px-3 py-2 rounded-xl border border-(--card-border) bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 resize-none"
                        placeholder={placeholder}
                        dir="auto"
                    />
                </div>
            ))}
        </div>
    );
}
