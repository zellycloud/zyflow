#!/bin/bash
#
# check-upstream.sh - Check for updates in upstream GitDiagram repository
#
# Usage:
#   ./scripts/check-upstream.sh [--update]
#
# Options:
#   --update  Download and show diff for changed files
#

set -e

UPSTREAM_REPO="ahmedkhaleel2004/gitdiagram"
UPSTREAM_BRANCH="main"
LOCAL_PACKAGE="packages/gitdiagram-core"
TRACKED_FILES="backend/app/prompts.py"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo "=================================================="
echo "GitDiagram Upstream Sync Check"
echo "=================================================="
echo ""
echo "Upstream: https://github.com/${UPSTREAM_REPO}"
echo "Branch: ${UPSTREAM_BRANCH}"
echo "Local Package: ${LOCAL_PACKAGE}"
echo ""

# Get upstream commit info
echo "Fetching upstream repository info..."
UPSTREAM_API="https://api.github.com/repos/${UPSTREAM_REPO}/commits/${UPSTREAM_BRANCH}"
UPSTREAM_COMMIT=$(curl -s "${UPSTREAM_API}" | grep -m1 '"sha"' | cut -d'"' -f4)
UPSTREAM_DATE=$(curl -s "${UPSTREAM_API}" | grep -m1 '"date"' | cut -d'"' -f4)

if [ -z "${UPSTREAM_COMMIT}" ]; then
  echo -e "${RED}Error: Could not fetch upstream commit info${NC}"
  exit 1
fi

echo "Upstream latest commit: ${UPSTREAM_COMMIT:0:7}"
echo "Commit date: ${UPSTREAM_DATE}"
echo ""

# Check local sync status
LOCAL_SYNC_FILE="${LOCAL_PACKAGE}/UPSTREAM.md"
if [ -f "${LOCAL_SYNC_FILE}" ]; then
  LAST_SYNC=$(grep -oP 'Last synced.*commit `\K[a-f0-9]+' "${LOCAL_SYNC_FILE}" 2>/dev/null || echo "unknown")
  echo "Local last synced: ${LAST_SYNC:0:7}"
else
  LAST_SYNC="unknown"
  echo -e "${YELLOW}Warning: No UPSTREAM.md found${NC}"
fi

echo ""

# Compare tracked files
echo "Checking tracked files for changes..."
echo ""

CHANGES_FOUND=0

for FILE in ${TRACKED_FILES}; do
  UPSTREAM_URL="https://raw.githubusercontent.com/${UPSTREAM_REPO}/${UPSTREAM_BRANCH}/${FILE}"

  # Get upstream file hash
  UPSTREAM_HASH=$(curl -sL "${UPSTREAM_URL}" | sha256sum | cut -d' ' -f1)

  if [ "${UPSTREAM_HASH}" == "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855" ]; then
    echo -e "  ${YELLOW}[SKIP]${NC} ${FILE} (not found upstream)"
    continue
  fi

  echo -e "  ${GREEN}[CHECK]${NC} ${FILE}"

  if [ "$1" == "--update" ]; then
    # Download the file for comparison
    TEMP_FILE=$(mktemp)
    curl -sL "${UPSTREAM_URL}" > "${TEMP_FILE}"
    echo "    Downloaded to: ${TEMP_FILE}"
    CHANGES_FOUND=1
  fi
done

echo ""
echo "=================================================="

if [ "${LAST_SYNC}" != "${UPSTREAM_COMMIT:0:${#LAST_SYNC}}" ]; then
  echo -e "${YELLOW}Status: Updates may be available${NC}"
  echo ""
  echo "To view changes:"
  echo "  1. Visit: https://github.com/${UPSTREAM_REPO}/compare/${LAST_SYNC}...${UPSTREAM_BRANCH}"
  echo "  2. Run: ./scripts/check-upstream.sh --update"
  echo ""
  echo "To sync:"
  echo "  1. Review changes in upstream prompts.py"
  echo "  2. Update ${LOCAL_PACKAGE}/src/prompts.ts"
  echo "  3. Update UPSTREAM.md with new commit hash"
else
  echo -e "${GREEN}Status: Up to date${NC}"
fi

echo "=================================================="
