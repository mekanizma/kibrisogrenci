#!/usr/bin/env bash
# CI guard (1.3 / acceptance 2): fail the build if the service-role secret or the
# string SERVICE_ROLE leaks into the compiled client bundle.
set -euo pipefail
BUILD_DIR="${1:-.next}"
PATTERNS=("SERVICE_ROLE" "sb_secret_" "SUPABASE_SECRET_KEY")
fail=0
for p in "${PATTERNS[@]}"; do
  if grep -rIl "$p" "$BUILD_DIR/static" "$BUILD_DIR/server/app" 2>/dev/null | grep -q .; then
    echo "❌ Secret pattern '$p' found in client bundle!"; fail=1
  fi
done
if [ "$fail" -ne 0 ]; then echo 'Bundle secret scan FAILED'; exit 1; fi
echo '✅ Bundle secret scan passed (no service-role secret in client bundle).'
