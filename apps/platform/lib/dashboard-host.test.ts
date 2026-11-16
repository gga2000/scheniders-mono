import { describe, expect, it } from "vitest";
import { dashboardHostsFromEnv, dashboardRedirectUrl } from "./dashboard-host";

const page = (host: string | null, pathname = "/orders", search = "", method = "GET") => ({ host, method, pathname, search });

describe("dashboardHostsFromEnv", () => {
    it("is off until both the new address and an old one are set", () => {
        expect(dashboardHostsFromEnv({})).toBeNull();
        expect(dashboardHostsFromEnv({ DASHBOARD_HOST: "app.usefermi.com" })).toBeNull();
        expect(dashboardHostsFromEnv({ DASHBOARD_OLD_HOSTS: "schenidersapp.xyz" })).toBeNull();
    });

    it("reads a trimmed, lowercased list and never moves the new address onto itself", () => {
        expect(
            dashboardHostsFromEnv({ DASHBOARD_HOST: " App.UseFermi.com ", DASHBOARD_OLD_HOSTS: "SchenidersApp.xyz, app.usefermi.com,," }),
        ).toEqual({ to: "app.usefermi.com", from: ["schenidersapp.xyz"] });
    });
});

describe("dashboardRedirectUrl", () => {
    const hosts = dashboardHostsFromEnv({ DASHBOARD_HOST: "app.usefermi.com", DASHBOARD_OLD_HOSTS: "schenidersapp.xyz" });

    it("moves a page on the old address to the same path and query", () => {
        expect(dashboardRedirectUrl(hosts, page("schenidersapp.xyz", "/orders", "?status=new"))).toBe(
            "https://app.usefermi.com/orders?status=new",
        );
        expect(dashboardRedirectUrl(hosts, page("SchenidersApp.xyz:443", "/", ""))).toBe("https://app.usefermi.com/");
    });

    it("serves the new address, Vercel's own hosts and form posts where they are", () => {
        expect(dashboardRedirectUrl(hosts, page("app.usefermi.com"))).toBeNull();
        expect(dashboardRedirectUrl(hosts, page("scheniders-platform.vercel.app"))).toBeNull();
        expect(dashboardRedirectUrl(hosts, page("schenidersapp.xyz", "/login", "", "POST"))).toBeNull();
        expect(dashboardRedirectUrl(hosts, page(null))).toBeNull();
    });

    it("moves nothing while switched off", () => {
        expect(dashboardRedirectUrl(null, page("schenidersapp.xyz"))).toBeNull();
    });
});
