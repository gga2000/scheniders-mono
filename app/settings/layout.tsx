"use client";

export default function SettingsLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    // Protect all settings pages. Only users with ACCESS_SETTINGS permission (Admin) can view.
    return (
        <div className="min-h-screen bg-[var(--background)] flex flex-col items-center">
            {children}
        </div>
    );
}
