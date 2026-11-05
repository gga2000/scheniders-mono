/**
 * Opening the cash drawer that hangs off the receipt printer. A browser can only
 * reach it when the printer shows up as a serial (COM) port, through Web Serial
 * in Chrome or Edge. Printers that only install as a Windows printer open the
 * drawer from their driver's "cash drawer" setting instead.
 */

/** ESC p 0 25 250: pulse drawer pin 2 for 50 ms on, 500 ms off. The standard ESC/POS kick. */
export const DRAWER_KICK = new Uint8Array([0x1b, 0x70, 0x00, 0x19, 0xfa]);

interface SerialPortLike {
    open(options: { baudRate: number }): Promise<void>;
    close(): Promise<void>;
    writable: WritableStream<Uint8Array> | null;
}
interface SerialLike {
    getPorts(): Promise<SerialPortLike[]>;
    requestPort(): Promise<SerialPortLike>;
}

function serial(): SerialLike | null {
    if (typeof navigator === "undefined" || !("serial" in navigator)) return null;
    return (navigator as Navigator & { serial: SerialLike }).serial;
}

/** Whether this browser can talk to a serial port at all. */
export function drawerSupported(): boolean {
    return serial() !== null;
}

/** Asks the cashier to pick the printer's port once; the browser remembers it on this device. */
export async function connectDrawer(): Promise<boolean> {
    const s = serial();
    if (!s) return false;
    await s.requestPort();
    return true;
}

/** Sends the kick to the remembered port. Resolves false when no port was ever picked. */
export async function openDrawer(): Promise<boolean> {
    const s = serial();
    if (!s) return false;
    const [port] = await s.getPorts();
    if (!port) return false;
    await port.open({ baudRate: 9600 });
    try {
        const writer = port.writable?.getWriter();
        if (!writer) return false;
        try {
            await writer.write(DRAWER_KICK);
        } finally {
            writer.releaseLock();
        }
        return true;
    } finally {
        await port.close();
    }
}
