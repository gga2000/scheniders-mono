/**
 * Push services browsers actually hand out. The server later POSTs to the
 * endpoint, so any other host would turn a subscription into a way to make
 * the server call an address of the caller's choosing.
 */
const PUSH_SERVICE_HOSTS = [
    /^fcm\.googleapis\.com$/,
    /^android\.googleapis\.com$/,
    /^updates\.push\.services\.mozilla\.com$/,
    /^web\.push\.apple\.com$/,
    /^[a-z0-9-]+\.push\.apple\.com$/,
    /^[a-z0-9-]+\.notify\.windows\.com$/,
];

export function isPushServiceEndpoint(raw: string): boolean {
    let url: URL;
    try {
        url = new URL(raw);
    } catch {
        return false;
    }
    if (url.protocol !== "https:" || url.port !== "" || url.username || url.password) return false;
    return PUSH_SERVICE_HOSTS.some(re => re.test(url.hostname.toLowerCase()));
}
