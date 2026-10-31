import { describe, it, expect } from "vitest";
import { autoBackupFoldersToPrune } from "./vault-retention";

describe("autoBackupFoldersToPrune", () => {
    const folder = (day: number) => `auto_csv_2026-10-${String(day).padStart(2, "0")}T01-00-00-000Z`;

    it("keeps the newest folders and returns the rest", () => {
        const names = [1, 2, 3, 4, 5].map(folder);
        expect(autoBackupFoldersToPrune(names, 2)).toEqual([folder(3), folder(2), folder(1)]);
    });

    it("never touches manual syncs or unknown names", () => {
        const names = ["sync_2026-10-01T00-00-00-000Z.scheniders", "notes", folder(1), folder(2)];
        expect(autoBackupFoldersToPrune(names, 1)).toEqual([folder(1)]);
    });

    it("returns nothing while under the limit", () => {
        expect(autoBackupFoldersToPrune([folder(1)], 14)).toEqual([]);
    });
});
