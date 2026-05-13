#!/usr/bin/env bash
# Validate platform session JWT enforcement across all layers
# Usage: ./verify-platform-session.sh
# Requires: jq, curl, backend running on localhost:3000
# Set these to actual agent keys from your env files

PLATFORM_KEY="${PLATFORM_KEY:-$(cat ~/Projects/VibeTasks/.env.mcptesting 2>/dev/null)}"
PROJECT_KEY="${PROJECT_KEY:-$(cat ~/Projects/VibeTasks/.env.agentsmith 2>/dev/null)}"
HUB="${HUB:-http://localhost:3000}"
RED='\033[0;31m'
GREEN='\033[0;32m'
NC='\033[0m'

pass() { echo -e "  ${GREEN}PASS${NC} $1"; }
fail() { echo -e "  ${RED}FAIL${NC} $1"; }

echo "=== Step 1: Create platform session JWT ==="
SESSION=$(curl -s -X POST "$HUB/api/agent/session" \
  -H "x-agent-api-key: $PLATFORM_KEY")
JWT=$(echo "$SESSION" | jq -r '.token')
AGENT_COUNT=$(echo "$SESSION" | jq '.agents | length')
echo "  JWT prefix: ${JWT:0:20}..."
echo "  Agents in roster: $AGENT_COUNT"
echo "  Expires: $(echo "$SESSION" | jq -r '.expiresAt')"
[ -n "$JWT" ] && [ "$JWT" != "null" ] && pass "Session created" || fail "No JWT"

echo ""
echo "=== Step 2: GET read operation (should work WITHOUT platform session) ==="
STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$HUB/api/agent/projects" \
  -H "x-agent-api-key: $PROJECT_KEY")
[ "$STATUS" = "200" ] && pass "GET /projects no JWT → $STATUS" || fail "GET /projects no JWT → $STATUS"

echo ""
echo "=== Step 3: Write operation WITHOUT platform session (should 403) ==="
RESP=$(curl -s -w "\n%{http_code}" -X POST "$HUB/api/agent/projects/10/tasks" \
  -H "x-agent-api-key: $PROJECT_KEY" \
  -H "Content-Type: application/json" \
  -d '{"name":"Test - should be blocked"}')
HTTP_CODE=$(echo "$RESP" | tail -1)
BODY=$(echo "$RESP" | head -1)
[ "$HTTP_CODE" = "403" ] && pass "POST task no JWT → $HTTP_CODE (blocked)" || fail "POST task no JWT → $HTTP_CODE (expected 403)"
echo "  Response: $BODY"

echo ""
echo "=== Step 4: Write operation WITH platform session (should 200/201) ==="
RESP=$(curl -s -w "\n%{http_code}" -X POST "$HUB/api/agent/projects/10/tasks" \
  -H "x-agent-api-key: $PROJECT_KEY" \
  -H "x-platform-session: $JWT" \
  -H "Content-Type: application/json" \
  -d '{"name":"Test - should succeed"}')
HTTP_CODE=$(echo "$RESP" | tail -1)
[ "$HTTP_CODE" = "201" ] && pass "POST task with JWT → $HTTP_CODE (allowed)" || fail "POST task with JWT → $HTTP_CODE (expected 201)"

echo ""
echo "=== Step 5: Check X-Platform-Session-Status response header ==="
HEADER=$(curl -s -I -X POST "$HUB/api/agent/projects/10/tasks" \
  -H "x-agent-api-key: $PROJECT_KEY" \
  -H "x-platform-session: $JWT" \
  -H "Content-Type: application/json" \
  -d '{"name":"Test"}' 2>/dev/null | grep -i x-platform-session-status)
[ -n "$HEADER" ] && pass "Response header present: $HEADER" || fail "Response header missing"

echo ""
echo "=== Step 6: PATCH without JWT (should 403) ==="
RESP=$(curl -s -w "\n%{http_code}" -X PATCH "$HUB/api/agent/projects/10/tasks/1" \
  -H "x-agent-api-key: $PROJECT_KEY" \
  -H "Content-Type: application/json" \
  -d '{"name":"Renamed"}')
HTTP_CODE=$(echo "$RESP" | tail -1)
[ "$HTTP_CODE" = "403" ] && pass "PATCH task no JWT → $HTTP_CODE" || fail "PATCH task no JWT → $HTTP_CODE"

echo ""
echo "=== Step 7: Write with expired/invalid JWT (should 403) ==="
RESP=$(curl -s -w "\n%{http_code}" -X POST "$HUB/api/agent/projects/10/tasks" \
  -H "x-agent-api-key: $PROJECT_KEY" \
  -H "x-platform-session: this-is-not-a-valid-jwt" \
  -H "Content-Type: application/json" \
  -d '{"name":"Test"}')
HTTP_CODE=$(echo "$RESP" | tail -1)
BODY=$(echo "$RESP" | head -1)
[ "$HTTP_CODE" = "403" ] && pass "POST with bad JWT → $HTTP_CODE (blocked)" || fail "POST with bad JWT → $HTTP_CODE"

echo ""
echo "=== Step 8: Platform /session endpoint unauthorized (should fail without platform key) ==="
STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$HUB/api/agent/session" \
  -H "x-agent-api-key: $PROJECT_KEY")
[ "$STATUS" = "403" ] && pass "Non-platform agent calls /session → $STATUS" || fail "Non-platform agent calls /session → $STATUS"

echo ""
echo "=== Done ==="
echo "Backend logs will show [PlatformSession] ALLOWED/BLOCKED for each write request."