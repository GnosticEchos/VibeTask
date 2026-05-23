#!/usr/bin/env bash
# Functional test cycle: every vibetask-cli subcommand as AgentSmith (config/vibe-cli.toml).
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
PROJECT_ID=10
PLAN_COL=52
EXECUTE_COL=53
EXECUTE_TASK=181
EXECUTE_IDENT="SPEC-64"
VERIFY_TASK=152
COMPOUND_VERIFY="10-152"
DOC_ID=104
TMP_DOC="/tmp/vibetask-cli-func-test-doc.md"
LOG="${ROOT}/cli-agentsmith-functional-cycle.log"

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

echo "# vibetask-cli AgentSmith functional cycle $(date -Iseconds)" >"$LOG"
echo "CLI=$CLI CONFIG=$CONFIG" >>"$LOG"

# Ensure AgentSmith is active for delegated workflow commands
ACTIVE="$(grep '^active_agent' "$CONFIG" | cut -d= -f2 | tr -d ' \"')"
if [[ "$ACTIVE" != "AgentSmith" ]]; then
  run_test "agent switch AgentSmith" vt agent switch AgentSmith
fi

echo "# CLI functional test doc" >"$TMP_DOC"
echo "Created by cli-agentsmith-functional-cycle.sh" >>"$TMP_DOC"

run_test "global --help-tree" vt --help-tree
run_test "agent session" vt agent session --force
run_test "agent list" vt agent list
run_test "agent status" vt agent status
run_test "agent refresh" vt agent refresh
run_test "agent refresh --name AgentSmith" vt agent refresh --name AgentSmith
skip_test "agent enlist" "requires live API key; not run in automated cycle"
skip_test "agent switch" "would change active agent; cycle stays AgentSmith"

run_test "project list" vt project list
run_test "project tasks" vt project tasks "$PROJECT_ID" --limit 5
run_test "project docs" vt project docs "$PROJECT_ID" --limit 5
run_test "project overview" vt project overview
run_test "project state" vt project state "$PROJECT_ID" --per-column-limit 2
run_test "project context" vt project context "$PROJECT_ID" "$EXECUTE_TASK"
run_test "project read-doc" vt project read-doc "$PROJECT_ID" "$DOC_ID"
run_test "project create-doc" vt project create-doc "$PROJECT_ID" \
  --title "CLI Func Test Doc $(date +%s)" \
  --role specification \
  --file "$TMP_DOC"

run_test "tools list" vt tools list
run_test "tools list --column Execute" vt tools list --column Execute
run_test "tools describe query_health" vt tools describe query_health
run_test "tools call query_health" vt tools call query_health --args-json '{}'
run_test "tools call query_projects" vt tools call query_projects --args-json '{}'
run_test "tools call query_tasks" vt tools call query_tasks --args-json "{\"project_id\":$PROJECT_ID,\"limit\":5}"
run_test "tools call read_project_state" vt tools call read_project_state --args-json "{\"project_id\":$PROJECT_ID,\"per_column_limit\":2}"
run_test "tools call read_project_overview" vt tools call read_project_overview --args-json '{}'
run_test "tools call list_agents" vt tools call list_agents --args-json '{}'
run_test "tools call agent_status" vt tools call agent_status --args-json '{}'
run_test "tools call find_tools" vt tools call find_tools --args-json '{"query":"health"}'

run_test "search tasks" vt search tasks "mcp" --project-id "$PROJECT_ID" --limit 5
run_test "search docs" vt search docs "constitution" --project-id "$PROJECT_ID" --limit 3
run_test "search projects" vt search projects "spec"
run_test "search all" vt search all "vibe" --project-id "$PROJECT_ID" --limit 5 --doc-limit 3

# Task workflow: create in Plan, then exercise column-specific commands
CREATE_OUT="/tmp/vibetask-cli-func-create.json"
if vt -f json task create "$PROJECT_ID" "CLI Func Test Cycle $(date +%s)" \
  --description "Automated functional test task" \
  --column-id "$PLAN_COL" >"$CREATE_OUT" 2>>"$LOG"; then
  echo "" | tee -a "$LOG"
  echo "=== task create ===" | tee -a "$LOG"
  echo "RESULT: PASS" | tee -a "$LOG"
  PASS=$((PASS + 1))
  NEW_TASK_ID="$(grep -oE '"id"[[:space:]]*:[[:space:]]*[0-9]+' "$CREATE_OUT" | head -1 | grep -oE '[0-9]+$' || true)"
  if [[ -z "$NEW_TASK_ID" ]]; then
    NEW_TASK_ID=180
  fi
else
  echo "" | tee -a "$LOG"
  echo "=== task create ===" | tee -a "$LOG"
  echo "RESULT: FAIL" | tee -a "$LOG"
  FAIL=$((FAIL + 1))
  NEW_TASK_ID=180
fi

run_test "task move (plan->execute)" vt task move "$PROJECT_ID" "$NEW_TASK_ID" "$EXECUTE_COL"
run_test "task update-progress" vt task update-progress "$PROJECT_ID" "$EXECUTE_TASK" \
  "CLI functional test progress note" --completion-percentage 10
run_test "task link-document" vt task link-document "$PROJECT_ID" "$EXECUTE_TASK" \
  "CLI link test" "# Linked from functional cycle" PLAN \
  --link-description "cli func test"
run_test "task request-help" vt task request-help "$PROJECT_ID" "$EXECUTE_TASK" \
  TECHNICAL "Need review of CLI functional test" --priority MEDIUM

run_test "task reflect" vt task reflect "$COMPOUND_VERIFY" \
  "CLI functional test reflection" \
  --file /tmp/foo.rs \
  --requirements-met --tests-passing --code-quality-ok \
  --documentation-complete --no-breaking-changes --security-validated

run_test "task approve" vt task approve "$COMPOUND_VERIFY" \
  "CLI functional test approval note" --confirm-integrity-passed

run_test "task reject" vt task reject "$COMPOUND_VERIFY" \
  "CLI functional test rejection (may fail if not approvable)" \
  --required-action "Re-run tests"

echo "" | tee -a "$LOG"
echo "========================================" | tee -a "$LOG"
echo "SUMMARY: PASS=$PASS FAIL=$FAIL SKIP=$SKIP" | tee -a "$LOG"
echo "Full log: $LOG" | tee -a "$LOG"

if [[ "$FAIL" -gt 0 ]]; then
  exit 1
fi
exit 0
