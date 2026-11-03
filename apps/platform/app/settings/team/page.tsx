import { redirect } from "next/navigation";

// Team management lives in Settings → Team. This route stays so old links work.
export default function TeamSettingsRedirect() {
    redirect("/settings?section=team");
}
