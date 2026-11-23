import type { Metadata } from "next";

export const metadata: Metadata = {
    title: "Fermi",
    description: "Sign in to Fermi Order Management",
};

export default function AuthLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    // The app's light cream (--background, light theme): the auth screens are light-only.
    return (
        <div className="min-h-screen bg-[#F5F0E8]">
            {children}
        </div>
    );
}
