# Git Branching Workflow

## How It Works (No Manual Copying Needed!)

Git stores **snapshots** of your code. You can switch between different versions instantly.

```
main (stable) ──────────────────────────────▶
                \
                 feature/workflow-tabs ──────▶ (experimental)
```

## Quick Reference

### Before Starting a New Feature
```bash
# Make sure main is clean
git checkout main
git pull origin main

# Create a new branch
git checkout -b feature/your-feature-name
```

### While Working on Feature
```bash
# Save your progress frequently
git add .
git commit -m "Description of changes"
```

### If Feature Works - Merge to Main
```bash
git checkout main
git merge feature/your-feature-name
git push origin main
```

### If Feature Breaks Things - Abandon It
```bash
git checkout main              # Switch back to stable
git branch -D feature/broken   # Delete the broken branch
# Your main code is untouched!
```

## Your Current Branches
- `main` - Your stable production code
- Feature branches - Created as needed for experiments

## Safety Guarantees
1. **Main is always safe** - Never breaks even if feature branch is broken
2. **Instant rollback** - Just `git checkout main` to go back
3. **No file copying** - Git remembers everything
4. **Remote backup** - Push to GitHub for cloud backup
