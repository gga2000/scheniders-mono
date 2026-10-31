/** Daily cron folders kept per store; older ones are deleted after each run. */
export const AUTO_BACKUP_KEEP = 14;

const AUTO_FOLDER = /^auto_csv_[0-9A-Za-z-]+$/;

/**
 * Which automated backup folders to delete: every `auto_csv_<timestamp>` folder
 * beyond the newest `keep`. The timestamp is ISO-8601 with `:` and `.` replaced,
 * so a plain string sort is chronological. Anything else in the store's folder
 * (manual cloud syncs) is never touched.
 */
export function autoBackupFoldersToPrune(names: readonly string[], keep = AUTO_BACKUP_KEEP): string[] {
    return names
        .filter((name) => AUTO_FOLDER.test(name))
        .sort()
        .reverse()
        .slice(keep);
}
