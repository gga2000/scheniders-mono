import type { Metadata } from "next";

export const metadata: Metadata = {
    title: "Login | Schenider OMS",
    description: "Sign in to Schenider Order Management System",
};

export default function AuthLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <div className="min-h-screen bg-gradient-to-br from-[#F5F0E8] via-[#FDF5D4] to-[#E8F8E0]">
            {children}
        </div>
    );
}
