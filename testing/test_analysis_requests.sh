#!/usr/bin/env bash
set -euo pipefail

BASE_URL=${BASE_URL:-http://localhost:3000}
API_PATH="/analysis/relationships/explain"

# Helper to post and pretty-print
post() {
  local body=$1
  echo "\n--- Request: $body"
  curl -sS -X POST "$BASE_URL$API_PATH" -H 'Content-Type: application/json' -d "$body" | jq . || true
}

# 1) Prefixed VDEM indices, exact country
post '{"indexA":"VDEM:v2x_polyarchy","indexB":"VDEM:v2x_liberal","country":"Albania","execute":false}'

# 2) Unprefixed codes (should resolve via VDEM) - Albania
post '{"indexA":"v2x_polyarchy","indexB":"v2x_liberal","country":"Albania","execute":false}'

# 3) IMF code (WEO/NEA) unprefixed - uses IMF definitions
post '{"indexA":"NGDP_RPCH","indexB":"NGDP","country":"Albania","execute":false}'

# 4) Fuzzy country name (typo) - e.g., "Alabania" should match "Albania"
post '{"indexA":"v2x_polyarchy","indexB":"v2x_liberal","country":"Alabania","execute":false}'

# 5) Execute=true (requires OPENAI_API_KEY set in env) - will attempt real LLM call
post '{"indexA":"v2x_polyarchy","indexB":"v2x_liberal","country":"Albania","execute":true}'

# 6) Missing country - should return 404
post '{"indexA":"v2x_polyarchy","indexB":"v2x_liberal","country":"NoSuchCountry","execute":false}'
