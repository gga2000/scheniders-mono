---
description: Create a stable backup version
---
# Create Backup Workflow

This workflow creates a stable backup point that you can revert to at any time.

## Steps:

// turbo-all

1. **Commit all current changes**
```bash
git add .
git commit -m "feat: Backup checkpoint - [brief description of what's being backed up]"
```

2. **Create a tagged version**
```bash
git tag -a backup-$(date +%Y%m%d-%H%M%S) -m "Stable backup point"
```

3. **Push to GitHub (including tags)**
```bash
git push origin main --tags
```

## To Restore from a Backup:

1. **List all backups**
```bash
git tag -l "backup-*"
```

2. **Create a new branch from the backup tag**
```bash
git checkout -b restore-from-backup backup-YYYYMMDD-HHMMSS
```

3. **If you want to completely reset to a backup (destructive)**
```bash
git reset --hard backup-YYYYMMDD-HHMMSS
```

## Notes:
- Backups are stored as Git tags with the prefix `backup-`
- Tags are timestamped for easy identification
- All backups are pushed to GitHub for redundancy
