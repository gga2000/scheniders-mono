/** Prints a full HTML document through a hidden frame, so no new window opens. */
export function printHtmlDocument(html: string): void {
    const frame = document.createElement("iframe");
    frame.setAttribute("aria-hidden", "true");
    frame.style.cssText = "position:fixed;width:0;height:0;border:0;right:0;bottom:0;";
    frame.srcdoc = html;
    frame.onload = () => {
        const win = frame.contentWindow;
        if (!win) return;
        win.onafterprint = () => frame.remove();
        win.focus();
        win.print();
    };
    document.body.appendChild(frame);
}
