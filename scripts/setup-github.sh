#!/bin/bash
# One-time setup: create GitHub repo and push (requires GitHub CLI: brew install gh)
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
REPO_NAME="${1:-asia-insurance-daily}"

cd "$ROOT"

if ! command -v gh >/dev/null 2>&1; then
  echo "GitHub CLI (gh) is not installed."
  echo "Install: brew install gh && gh auth login"
  echo ""
  echo "Or create the repo manually on github.com/new, then run:"
  echo "  git remote add origin https://github.com/YOUR_USER/${REPO_NAME}.git"
  echo "  git push -u origin main"
  exit 1
fi

gh repo create "$REPO_NAME" --public --source=. --remote=origin --push
gh api "repos/{owner}/${REPO_NAME}/pages" -X POST -f build_type=workflow 2>/dev/null || true

echo ""
echo "Done. After the first workflow run completes (~2 min), your site will be at:"
echo "  https://$(gh api user -q .login).github.io/${REPO_NAME}/"
echo ""
echo "Enable Pages if needed: Repo → Settings → Pages → Source: GitHub Actions"
