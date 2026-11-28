import { AuthCardShell } from "@/components/auth/auth-card-shell";
import { AuthHero } from "@/components/auth/auth-hero";
import { PairAnswer } from "@/components/auth/pair-answer";

/**
 * Opened on the phone by scanning the code on a computer's sign-in page
 * (lib/computer-sign-in.ts): the person says whether that computer may open
 * their account.
 */
export default async function PairPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    return (
        <AuthCardShell showBack={false} aside={<AuthHero variant="login" />} asideOnPhones={false} bare>
            <PairAnswer id={id} />
        </AuthCardShell>
    );
}
