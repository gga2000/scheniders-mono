import { AdminShell } from "@/components/layout/admin-shell";
import { ConsoleNotFound } from "@/components/shared/console-not-found";

/**
 * Any address the console has no page for, signed in (the middleware sends a
 * signed-out visitor to sign in first). It answers 404 with the console's
 * menu, where it used to show the framework's bare "404" with no way back.
 *
 * It lives here, not under (dashboard): that group's loading screen starts
 * the answer before a page can say "not found", so the answer was a 200.
 */
export default function NotFound() {
  // Named here, so the first answer's tab already says it: set from the page
  // once it ran, the tab first read "Admin" or the menu page of the address
  // ("Merchants" under /merchants/<id>/extra), round 18.
  return (
    <AdminShell pageName="Page not found">
      <ConsoleNotFound />
    </AdminShell>
  );
}
