#!/bin/bash
# Automated backup script for creating stable backup points

set -e  # Exit on error

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${BLUE}=== Creating Backup ===${NC}"

# Check if there are uncommitted changes
if [[ -n $(git status --porcelain) ]]; then
    echo -e "${YELLOW}Uncommitted changes detected. Committing...${NC}"
    
    # Read commit message from user or use default
    if [ -z "$1" ]; then
        COMMIT_MSG="feat: Automated backup checkpoint"
    else
        COMMIT_MSG="$1"
    fi
    
    git add .
    git commit -m "$COMMIT_MSG"
    echo -e "${GREEN}✓ Changes committed${NC}"
else
    echo -e "${GREEN}✓ No uncommitted changes${NC}"
fi

# Create timestamped tag
TIMESTAMP=$(date +%Y%m%d-%H%M%S)
TAG_NAME="backup-$TIMESTAMP"

echo -e "${BLUE}Creating backup tag: $TAG_NAME${NC}"
git tag -a "$TAG_NAME" -m "Stable backup point created at $(date)"
echo -e "${GREEN}✓ Backup tag created${NC}"

# Push to remote if it exists
if git remote | grep -q 'origin'; then
    echo -e "${BLUE}Pushing to GitHub...${NC}"
    git push origin main --tags
    echo -e "${GREEN}✓ Pushed to GitHub${NC}"
else
    echo -e "${YELLOW}⚠ No remote repository configured. Backup is local only.${NC}"
fi

echo -e "${GREEN}=== Backup Complete ===${NC}"
echo -e "${BLUE}Backup tag: $TAG_NAME${NC}"
echo -e "${BLUE}To restore: git checkout -b restore $TAG_NAME${NC}"
