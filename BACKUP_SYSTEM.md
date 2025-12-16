# Version Control & Backup System

This project uses a robust Git-based backup and version control system to ensure you can always revert to previous stable states.

## 🚀 Quick Start

### Create a Backup (Manual)
```bash
# Run the automated backup script
./scripts/create-backup.sh "Description of what's being backed up"
```

### Create a Backup (Using Workflow)
```bash
# Use the /create-backup workflow for step-by-step guidance
/create-backup
```

## 📁 Backup Strategy

### What Gets Backed Up
- All source code
- Configuration files
- Database schemas and migrations
- Documentation
- Dependencies (package.json, etc.)

### Backup Naming Convention
Backups are created as Git tags with the format:
```
backup-YYYYMMDD-HHMMSS
```
Example: `backup-20251216-023507`

## 🔄 How to Use Backups

### List All Backups
```bash
git tag -l "backup-*"
```

### View Backup Details
```bash
git show backup-20251216-023507
```

### Restore from a Backup (Safe Method)
Create a new branch from the backup tag without affecting your current work:
```bash
git checkout -b restore-from-backup backup-20251216-023507
```

### Restore from a Backup (Reset Current Branch)
⚠️ **Warning**: This will discard all changes after the backup point!
```bash
git reset --hard backup-20251216-023507
```

## 🔐 GitHub Integration

### Initial Setup
1. Create a new repository on GitHub
2. Add the remote:
```bash
git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO.git
```
3. Push your code and tags:
```bash
git push -u origin main --tags
```

### Automated Backups
The backup script automatically pushes to GitHub if a remote is configured. This provides:
- **Redundancy**: Your backups are stored both locally and on GitHub
- **Accessibility**: Access backups from any machine
- **Collaboration**: Share stable versions with team members

## 📋 Best Practices

### When to Create Backups
- ✅ Before making major changes to the codebase
- ✅ After completing a significant feature
- ✅ Before refactoring or restructuring code
- ✅ Before updating dependencies
- ✅ After fixing critical bugs
- ✅ At regular intervals (daily/weekly for active development)

### Backup Workflow
1. **Before Major Changes**: Create a backup using `/create-backup`
2. **During Development**: Commit changes regularly
3. **After Completion**: Create another backup to mark the stable state
4. **Push to GitHub**: Ensure backups are synced remotely

## 🛠️ Advanced Usage

### Create a Release Version
For major milestones, create a semantic version tag:
```bash
git tag -a v1.0.0 -m "Release version 1.0.0"
git push origin v1.0.0
```

### Compare Backups
See what changed between two backup points:
```bash
git diff backup-20251216-023507 backup-20251217-120000
```

### Delete Old Backups
If you have too many backups, you can delete old ones:
```bash
# Delete locally
git tag -d backup-20251215-100000

# Delete from GitHub
git push origin :refs/tags/backup-20251215-100000
```

## 🔍 Troubleshooting

### "No remote repository configured"
If you see this warning, you need to set up GitHub:
1. Create a repository on GitHub
2. Run: `git remote add origin YOUR_GITHUB_URL`
3. Run: `git push -u origin main --tags`

### "Uncommitted changes"
Before restoring a backup, either:
- Commit your current changes: `git add . && git commit -m "WIP"`
- Stash your changes: `git stash`
- Discard changes: `git reset --hard HEAD`

## 📞 Quick Reference

| Task | Command |
|------|---------|
| Create backup | `./scripts/create-backup.sh` |
| List backups | `git tag -l "backup-*"` |
| Restore backup | `git checkout -b restore backup-TAG` |
| Push to GitHub | `git push origin main --tags` |
| View changes | `git show backup-TAG` |
