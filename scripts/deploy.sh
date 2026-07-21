#!/usr/bin/env bash
#
# Deploy to production and repoint the public alias.
#
# Vercel keeps whatever *.vercel.app domain it generated when the project was
# created as the canonical production domain, and only that one follows new
# deploys. trace-your-path.vercel.app is a manual alias, so a plain
# `vercel deploy --prod` leaves it serving the previous build — the link is
# live, looks fine, and is silently stale. Renaming the project does not change
# this; only a custom domain would.
#
# Usage:  npm run deploy
set -euo pipefail

PUBLIC_ALIAS="trace-your-path.vercel.app"

echo "Deploying to production…"
DEPLOY_URL=$(vercel deploy --prod --yes | tail -1 | tr -d '[:space:]')

if [[ ! "$DEPLOY_URL" =~ ^https:// ]]; then
  echo "Could not parse a deployment URL from the Vercel output; got: $DEPLOY_URL" >&2
  exit 1
fi

echo "Deployed: $DEPLOY_URL"
echo "Pointing $PUBLIC_ALIAS at it…"
vercel alias set "$DEPLOY_URL" "$PUBLIC_ALIAS"

echo
echo "Verifying the alias serves this build…"
sleep 3
LIVE_ASSET=$(curl -s "https://$PUBLIC_ALIAS/" | grep -oE 'assets/index-[A-Za-z0-9_-]+\.js' | head -1)
LOCAL_ASSET=$(basename "$(ls -t dist/assets/*.js | head -1)")

if [[ "$LIVE_ASSET" == "assets/$LOCAL_ASSET" ]]; then
  echo "OK — https://$PUBLIC_ALIAS is serving $LOCAL_ASSET"
else
  echo "MISMATCH — live is '$LIVE_ASSET', local build is 'assets/$LOCAL_ASSET'" >&2
  echo "The alias may still be propagating; re-check in a few seconds." >&2
  exit 1
fi
