#!/usr/bin/env bash
# Full vibetask-cli exercise for AgentSmith, McpTesting, and GateKeeper3.
# Posts agent comments on touched tasks so they appear in the Hub UI.
set -u

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
unset ARGV0 2>/dev/null || true

if [[ -x "${ROOT}/target/release/vibetask-cli" ]]; then
  CLI="${ROOT}/target/release/vibetask-cli"
elif [[ -x "${ROOT}/target/debug/vibetask-cli" ]]; then
  CLI="${ROOT}/target/debug/vibetask-cli"
else
  echo "ERROR: build vibetask-cli first (cargo build -p vibetask-cli --release)"
  exit 1
fi

CONFIG="${ROOT}/config/vibe-cli.toml"
HUB_URL="${VIBETASK_HUB_URL:-http://localhost:3000}"
PROJECT_ID=10
PLAN_COL=52
EXECUTE_COL=53
VERIFY_COL=54
EXECUTE_TASK=181
VERIFY_TASK=152
COMPOUND_VERIFY="10-152"
DOC_ID=104
TMP_DOC="/tmp/vibetask-cli-live-doc.md"
LOG="${ROOT}/cli-multi-agent-live-cycle.log"
STAMP="$(date -Iseconds)"

PASS=0
FAIL=0
SKIP=0

run_test() {
  local name="$1"
  shift
  echo "" | tee -a "$LOG"
  echo "=== $name ===" | tee -a "$LOG"
  echo "\$ $*" | tee -a "$LOG"
  if "$@" >>"$LOG" 2>&1; then
    echo "RESULT: PASS" | tee -a "$LOG"
    PASS=$((PASS + 1))
  else
    local ec=$?
    echo "RESULT: FAIL (exit $ec)" | tee -a "$LOG"
    FAIL=$((FAIL + 1))
  fi
}

skip_test() {
  local name="$1"
  local reason="$2"
  echo "" | tee -a "$LOG"
  echo "=== $name ===" | tee -a "$LOG"
  echo "RESULT: SKIP ($reason)" | tee -a "$LOG"
  SKIP=$((SKIP + 1))
}

vt() {
  "$CLI" --config "$CONFIG" "$@"
}

platform_jwt() {
  awk '
    /^\[platform\]/ { in_platform=1; next }
    /^\[/ { in_platform=0 }
    in_platform && /^jwt[[:space:]]*=/ {
      sub(/^jwt[[:space:]]*=[[:space:]]*"/, "")
      sub(/"[[:space:]]*$/, "")
      print
      exit
    }
  ' "$CONFIG"
}

agent_api_key() {
  local agent="$1"
  local env_file="${ROOT}/.env.$(echo "$agent" | tr '[:upper:]' '[:lower:]')"
  if [[ ! -f "$env_file" ]]; then
    return 1
  fi
  grep -m1 '^VIBETASK_API_KEY=' "$env_file" | cut -d= -f2-
}

post_task_comment() {
  local agent="$1"
  local project="$2"
  local task="$3"
  local content="$4"
  local key jwt
  key="$(agent_api_key "$agent")" || return 1
  jwt="$(platform_jwt)"
  if [[ -z "$jwt" ]]; then
    echo "no platform JWT in config" >>"$LOG"
    return 1
  fi
  curl -sS -X POST "${HUB_URL}/api/agent/projects/${project}/tasks/${task}/comments" \
    -H "x-agent-api-key: ${key}" \
    -H "x-platform-session: ${jwt}" \
    -H "Content-Type: application/json" \
    -d "$(jq -n --arg c "$content" '{content: $c}')" >>"$LOG" 2>&1
}

comment_on_task() {
  local agent="$1"
  local task="$2"
  local action="$3"
  local detail="${4:-}"
  local msg="[${agent} @ ${STAMP}] ${action}"
  if [[ -n "$detail" ]]; then
    msg="${msg}: ${detail}"
  fi
  msg="${msg} — review in Hub task #${task} (project ${PROJECT_ID})."
  if post_task_comment "$agent" "$PROJECT_ID" "$task" "$msg"; then
    echo "COMMENT: task ${task} (${action})" | tee -a "$LOG"
  else
    echo "COMMENT: failed task ${task} (${action})" | tee -a "$LOG"
  fi
}

ensure_gatekeeper3() {
  if grep -q 'name = "GateKeeper3"' "$CONFIG" 2>/dev/null; then
    return 0
  fi
  local env_file="${ROOT}/.env.gatekeeper3"
  if [[ ! -f "$env_file" ]]; then
    echo "Missing ${env_file}; cannot enlist GateKeeper3" | tee -a "$LOG"
    return 1
  fi
  local key
  key="$(grep -m1 '^VIBETASK_API_KEY=' "$env_file" | cut -d= -f2-)"
  run_test "enlist GateKeeper3" vt agent enlist --key "$key" --as project-delegated --set-active
}

run_agent_cycle() {
  local agent="$1"
  local agent_type="$2"

  echo "" | tee -a "$LOG"
  echo "########################################" | tee -a "$LOG"
  echo "# Agent: ${agent} (${agent_type})" | tee -a "$LOG"
  echo "########################################" | tee -a "$LOG"

  run_test "${agent}: agent switch" vt agent switch "$agent"
  run_test "${agent}: agent session (platform)" vt agent session --name McpTesting --force
  run_test "${agent}: agent status" vt agent status
  run_test "${agent}: agent refresh" vt agent refresh --name "$agent"

  run_test "${agent}: project list" vt project list
  run_test "${agent}: project tasks" vt project tasks "$PROJECT_ID" --limit 5
  run_test "${agent}: project docs" vt project docs "$PROJECT_ID" --limit 5

  if [[ "$agent_type" == "Platform" ]]; then
    skip_test "${agent}: project state" "Platform read-only — no project delegation for read_project_state"
    skip_test "${agent}: project overview" "Platform read-only — overview requires delegated project access"
    run_test "${agent}: tools call query_health" vt tools call query_health --args-json '{}'
    run_test "${agent}: tools call query_projects" vt tools call query_projects --args-json '{}'
    run_test "${agent}: tools call list_agents" vt tools call list_agents --args-json '{}'
    skip_test "${agent}: task workflow" "Platform agent — delegated task writes skipped"
    return
  fi

  run_test "${agent}: project state" vt project state "$PROJECT_ID" --per-column-limit 2
  run_test "${agent}: project context" vt project context "$PROJECT_ID" "$EXECUTE_TASK"
  run_test "${agent}: project read-doc" vt project read-doc "$PROJECT_ID" "$DOC_ID"
  run_test "${agent}: tools list" vt tools list
  run_test "${agent}: tools list --column Execute" vt tools list --column Execute
  run_test "${agent}: search tasks" vt search tasks "cli" --project-id "$PROJECT_ID" --limit 5

  echo "# Live cycle doc ${agent}" >"$TMP_DOC"
  CREATE_OUT="/tmp/vibetask-cli-live-create-${agent}.json"
  if vt -f json task create "$PROJECT_ID" "CLI Live ${agent} $(date +%s)" \
    --description "Multi-agent live cycle" \
    --column-id "$PLAN_COL" >"$CREATE_OUT" 2>>"$LOG"; then
    echo "=== ${agent}: task create ===" | tee -a "$LOG"
    echo "RESULT: PASS" | tee -a "$LOG"
    PASS=$((PASS + 1))
    NEW_TASK_ID="$(jq -r '.[0].text // empty' "$CREATE_OUT" 2>/dev/null | grep -oE 'ID: [0-9]+' | awk '{print $2}' | head -1 || true)"
    if [[ -z "$NEW_TASK_ID" ]]; then
      NEW_TASK_ID="$(grep -oE '"id"[[:space:]]*:[[:space:]]*[0-9]+' "$CREATE_OUT" | head -1 | grep -oE '[0-9]+$' || true)"
    fi
    if [[ -z "$NEW_TASK_ID" ]]; then
      echo "WARN: could not parse new task id from create output" >>"$LOG"
      NEW_TASK_ID=180
    fi
  else
    echo "=== ${agent}: task create ===" | tee -a "$LOG"
    echo "RESULT: FAIL" | tee -a "$LOG"
    FAIL=$((FAIL + 1))
    NEW_TASK_ID=180
  fi
  comment_on_task "$agent" "$NEW_TASK_ID" "created task in Plan"

  if [[ "$agent" == "GateKeeper3" ]]; then
    run_test "${agent}: task move (plan->verify)" vt task move "$PROJECT_ID" "$NEW_TASK_ID" "$VERIFY_COL"
    comment_on_task "$agent" "$NEW_TASK_ID" "moved to Verify column"
    run_test "${agent}: task reflect" vt task reflect "$COMPOUND_VERIFY" \
      "GateKeeper3 live reflection" \
      --file /tmp/foo.rs \
      --requirements-met --tests-passing --code-quality-ok \
      --documentation-complete --no-breaking-changes --security-validated
    comment_on_task "$agent" "$VERIFY_TASK" "reflect on verify task"
  else
    run_test "${agent}: task move (plan->execute)" vt task move "$PROJECT_ID" "$NEW_TASK_ID" "$EXECUTE_COL"
    comment_on_task "$agent" "$NEW_TASK_ID" "moved to Execute"
    run_test "${agent}: task update-progress" vt task update-progress "$PROJECT_ID" "$EXECUTE_TASK" \
      "${agent} live progress note" --completion-percentage 15
    comment_on_task "$agent" "$EXECUTE_TASK" "update-progress"
    run_test "${agent}: task request-help" vt task request-help "$PROJECT_ID" "$EXECUTE_TASK" \
      TECHNICAL "${agent} live help request" --priority MEDIUM
    comment_on_task "$agent" "$EXECUTE_TASK" "request-help"
    run_test "${agent}: task link-document" vt task link-document "$PROJECT_ID" "$EXECUTE_TASK" \
      "Live link" "# Linked by ${agent}" PLAN --link-description "live cycle"
    comment_on_task "$agent" "$EXECUTE_TASK" "link-document"
  fi
}

echo "# vibetask-cli multi-agent live cycle ${STAMP}" >"$LOG"
echo "CLI=$CLI CONFIG=$CONFIG HUB=$HUB_URL" >>"$LOG"

if ! curl -sS -o /dev/null -w "%{http_code}" "${HUB_URL}/api/agent/health" -H "x-agent-api-key: invalid" | grep -qE '^[24]'; then
  echo "WARN: Hub may be down at ${HUB_URL}" | tee -a "$LOG"
fi

ensure_gatekeeper3 || true

run_agent_cycle "McpTesting" "Platform"
run_agent_cycle "AgentSmith" "ProjectDelegated"
run_agent_cycle "GateKeeper3" "ProjectDelegated"

echo "" | tee -a "$LOG"
echo "========================================" | tee -a "$LOG"
echo "SUMMARY: PASS=$PASS FAIL=$FAIL SKIP=$SKIP" | tee -a "$LOG"
echo "Full log: $LOG" | tee -a "$LOG"
echo "UI: open project ${PROJECT_ID} tasks ${EXECUTE_TASK}, ${VERIFY_TASK}, and newly created tasks for agent comments." | tee -a "$LOG"

if [[ "$FAIL" -gt 0 ]]; then
  exit 1
fi
exit 0
