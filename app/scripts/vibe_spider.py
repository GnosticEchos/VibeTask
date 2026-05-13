import subprocess
import re
import os
from datetime import datetime
from pathlib import Path

# Configuration (repo-relative so clones do not hard-code /home/...)
ROOT = Path(__file__).resolve().parents[1]
BINARY = str(ROOT / "target" / "release" / "vibetask-cli")
CONFIG = str(ROOT / "config" / "vibe-mcp.toml")
BASE_LOG_ROOT = str(ROOT / "vibetask_logs")
CWD = str(ROOT)

# Unique Session
SESSION_ID = datetime.now().strftime("%Y%m%d%H%M%S")
LOG_DIR = os.path.join(BASE_LOG_ROOT, f"Cli_testing_{SESSION_ID}")
os.makedirs(LOG_DIR, exist_ok=True)

# TEST DATA & SIGNATURES
TEST_DATA = {
    "agent_name": ["AgentSmith", "McpTesting"],
    "description": ["Test update from Vibe Spider."],
    "title": ["Spider Report"],
    "content": ["# Report\nAuto-generated."],
    "role": ["SPECIFICATION", "POST_MORTEM"],
    "query": ["status:OPEN", "specification"],
}

SIGNATURES = {
    "agent_switch": ["agent_name"],
    "project_tasks": ["project_id"],
    "project_docs": ["project_id"],
    "project_context": ["project_id", "task_id"],
    "task_update-progress": ["project_id", "task_id", "description"],
    "task_link-document": ["project_id", "task_id", "title", "content", "role"],
    "task_reflect": ["project_id", "task_id"],
    "task_approve": ["project_id", "task_id"],
    "task_reject": ["project_id", "task_id"],
    "tools_describe": ["tool_name"],
    "search_tasks": ["query", "project_id"],
    "search_docs": ["query", "project_id"],
    "search_projects": ["query"],
    "search_all": ["query", "project_id"],
}

KB = {"project_id": set(), "task_id": set(), "tool_name": set()}

def judge_output(text, returncode):
    """Analyzes output and returns a categorized verdict."""
    if "panicked at" in text:
        return "❌ [FAIL: BUG] - Rust panic detected. Immediate fix required."
    if "error decoding response body" in text or "Deserialization error" in text:
        return "⚠️  [FAIL: DEBT] - Schema mismatch. Rust models out of sync with Hub."
    if "only available for" in text or "only available in" in text:
        return "✅ [PASS: LOGIC] - Correctly enforced Lattice/Role affinity gate."
    if "Forbidden" in text or "insufficient permissions" in text:
        return "✅ [PASS: SECURITY] - Correctly enforced API permission gate."
    if "Delegation:" in text and "columnAllowance" in text:
        return "✅ [PASS: CONTRACT] - Delegation lattice / column allowance surfaced."
    if "COLUMN_BOUND" in text or "column-bound" in text.lower():
        return "✅ [PASS: CONTRACT] - Column-bound delegation messaging present."
    if returncode == 0 and (
        "success" in text.lower()
        or "Found" in text
        or "Report" in text
        or "[" in text
        or "## " in text
        or "│" in text
        or "┌" in text
    ):
        return "✅ [PASS: SUCCESS] - Command executed successfully."
    if "required arguments were not provided" in text:
        return "ℹ️  [INFO: USAGE] - Missing arguments (Expected for discovery run)."
    
    return "❓ [UNKNOWN] - Result requires human review."

def run_cmd(args, out_format=None):
    """Executes command, records output, and appends JUDGE verdict."""
    full_cmd = [BINARY, "--config", CONFIG]
    if out_format:
        full_cmd += ["-f", out_format]
    full_cmd += args
    print(f"  [>] {' '.join(full_cmd)}")
    
    result = subprocess.run(full_cmd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, cwd=CWD)
    verdict = judge_output(result.stdout, result.returncode)
    
    fmt_suffix = f"_{out_format}" if out_format else ""
    log_name = ("_".join(args).replace("/", "_").strip("_") or "root") + fmt_suffix
    log_path = os.path.join(LOG_DIR, f"{log_name}.log")
    
    with open(log_path, "a") as f:
        f.write(f"\n--- EXECUTION: {' '.join(full_cmd)} ---\n")
        f.write(result.stdout)
        f.write(f"\nVERDICT: {verdict}\n")
        f.write("="*60 + "\n")
    
    # Extract IDs for next turns
    pids = re.findall(r"\(ID:\s*(\d+)\)", result.stdout)
    for pid in pids:
        KB["project_id"].add(pid)
    for line in result.stdout.splitlines():
        low = line.lower()
        if "task" in low:
            for m in re.finditer(r"\(ID:\s*(\d+)\)", line):
                KB["task_id"].add(m.group(1))
    noise_tool_tokens = {
        "project_id",
        "task_id",
        "args_json",
        "content_type",
        "page",
        "limit",
        "total",
        "total_pages",
    }
    tools = re.findall(r"\"([a-z][a-z0-9_]+)\"", result.stdout)
    for t in tools:
        if "_" in t and t not in noise_tool_tokens and not t.endswith("_id"):
            KB["tool_name"].add(t)

    return result

def get_args_for_type(arg_type):
    if arg_type in KB and KB[arg_type]: return list(KB[arg_type])
    if arg_type in TEST_DATA: return TEST_DATA[arg_type]
    return []

def generate_combinations(signature):
    if not signature: return [[]]
    arg_type = signature[0]
    values = get_args_for_type(arg_type)
    sub_combos = generate_combinations(signature[1:])
    combos = []
    for v in values:
        for sc in sub_combos: combos.append([v] + sc)
    return combos

def get_subcommands(cmd_path):
    res = subprocess.run([BINARY, "--config", CONFIG] + cmd_path + ["--help"], capture_output=True, text=True, cwd=CWD)
    commands = []
    found = False
    for line in res.stdout.splitlines():
        if "Commands:" in line: found = True; continue
        if found:
            if not line.strip() or "Options:" in line: break
            match = re.match(r"^\s+([a-z0-9-]+)", line)
            if match:
                name = match.group(1).strip()
                if name != "help": commands.append(name)
    return commands

def crawl(current_path):
    subs = get_subcommands(current_path)
    if not subs:
        sig_key = "_".join(current_path)
        if sig_key in SIGNATURES:
            combos = generate_combinations(SIGNATURES[sig_key])
            for combo in combos: run_cmd(current_path + combo)
        else:
            run_cmd(current_path)
    else:
        for s in subs: crawl(current_path + [s])

def run_search_smoke():
    """Run explicit search smoke checks across output formats."""
    checks = [
        ["search", "projects", "spec"],
        ["search", "tasks", "status:OPEN", "--project-id", "10"],
        ["search", "docs", "specification", "--project-id", "10"],
        ["search", "all", "specification", "--project-id", "10"],
    ]
    for fmt in ("json", "comfy", "md"):
        for cmd in checks:
            run_cmd(cmd, out_format=fmt)

if __name__ == "__main__":
    print(f"🕷 Starting Judge Vibe Spider: {SESSION_ID}")
    
    print("\n--- Pass 1: Global Discovery ---")
    run_cmd(["agent", "switch", "McpTesting"])
    run_cmd(["project", "list"])
    run_cmd(["tools", "list"])
    KB["project_id"].add("10") # Bootstrap
    
    print("\n--- Pass 2: Targeted Stress Test ---")
    run_cmd(["agent", "switch", "AgentSmith"])
    crawl([])

    print("\n--- Pass 3: Search + Format Smoke ---")
    run_search_smoke()
    
    print(f"\n✅ Audit Complete. Verdicts saved to {LOG_DIR}")
