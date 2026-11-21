import Script from "next/script";
import { FERMI_SIGNUP_PIXEL_JS } from "@/lib/fermi-pixel";

/**
 * Loads Fermi's Meta Pixel on the sign-up page and sends its PageView. The
 * `_fbp` browser id is a usefermi.com cookie, so a visitor who came from the
 * landing page keeps the same id here and Meta joins the two visits. It also
 * sends the landing hand-over Lead (see FERMI_SIGNUP_PIXEL_JS).
 */
export function FermiSignupPixel() {
    return (
        <Script
            id="fermi-meta-pixel"
            strategy="afterInteractive"
            dangerouslySetInnerHTML={{
                __html: FERMI_SIGNUP_PIXEL_JS,
            }}
        />
    );
}
