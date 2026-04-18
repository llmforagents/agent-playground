#!/usr/bin/env bash
# Deploy the dashboard to Cloudflare Pages.
# Usage: ./scripts/deploy-cloudflare.sh [--preview]
#
# First run: `npx wrangler login` once to authenticate.
# Requires a Pages project named "llm4agents-dashboard" on your CF account.
# Create it once: `npx wrangler pages project create llm4agents-dashboard --production-branch main`

set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PROJECT_DIR"

BRANCH="main"
if [ "${1:-}" = "--preview" ]; then
  BRANCH="preview"
fi

echo "→ Running typecheck and tests…"
npm run typecheck
npm run test:ci

echo "→ Building production bundle…"
npm run build

echo "→ Deploying to Cloudflare Pages (branch: $BRANCH)…"
npx wrangler pages deploy dist \
  --project-name llm4agents-dashboard \
  --branch "$BRANCH" \
  --commit-dirty=true

echo "✓ Deployed."
