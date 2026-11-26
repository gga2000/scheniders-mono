import { AuthCardShell } from "@/components/auth/auth-card-shell";
import { AuthHero } from "@/components/auth/auth-hero";
import { FermiSignupPixel } from "@/components/auth/fermi-signup-pixel";
import { readSignupHandover } from "@/lib/signup-handover";
import { SignupForm } from "./signup-form";

/**
 * Rendered on the server for each visit, with what the owner typed on
 * usefermi.com already in the fields, so the HTML carries the whole form.
 * Before, the form read the link in the browser (useSearchParams), which kept
 * it out of the HTML: a spinner showed until all the page's code had run
 * (1.9 s on fast wifi, 6.8 s on a slow phone link).
 */
export default async function SignupPage({
    searchParams,
}: {
    searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
    const handover = readSignupHandover(await searchParams);
    return (
        <AuthCardShell showBack={false} aside={<AuthHero variant="signup" />} bare>
            <FermiSignupPixel />
            <SignupForm handover={handover} />
        </AuthCardShell>
    );
}
