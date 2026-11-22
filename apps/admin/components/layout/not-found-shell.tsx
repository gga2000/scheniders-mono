"use client";

import dynamic from "next/dynamic";

/**
 * The console's menu around the not-found page, loaded only when that page is
 * drawn. Next puts the root not-found page's client code on every page, so a
 * direct import of AdminShell there sent the whole menu a second time, next
 * to (dashboard)'s own copy: about 18 KB more script on every page (round 24).
 * Drawn on the server like any page, so the first answer already has the menu.
 */
export const NotFoundShell = dynamic(() => import("./admin-shell").then((m) => m.AdminShell));
