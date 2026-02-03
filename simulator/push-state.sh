#!/bin/bash
# Push current state to JSONBin for live dashboard

JSONBIN_ID="6982027d43b1c97be96246af"
ACCESS_KEY='$2a$10$Txsfu3FWRNtL8Wy1EruBxexEpaiaXB.b4hGyXJ.SUKX6Pz14rqptW'
STATE_FILE="$(dirname "$0")/data/state.json"

if [ ! -f "$STATE_FILE" ]; then
  echo "❌ No state file found at $STATE_FILE"
  exit 1
fi

echo "📤 Pushing state to JSONBin..."
RESPONSE=$(curl -s -X PUT "https://api.jsonbin.io/v3/b/${JSONBIN_ID}" \
  -H "Content-Type: application/json" \
  -H "X-Access-Key: ${ACCESS_KEY}" \
  -d @"$STATE_FILE")

if echo "$RESPONSE" | grep -q '"record"'; then
  ROUND=$(cat "$STATE_FILE" | grep -o '"round":[0-9]*' | cut -d: -f2)
  echo "✅ Pushed round $ROUND to live feed"
  echo "🔗 Dashboard: https://nexusacdev.github.io/brood/"
else
  echo "❌ Failed: $RESPONSE"
fi
