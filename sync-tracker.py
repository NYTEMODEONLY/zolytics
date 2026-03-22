#!/usr/bin/env python3
"""
Zolytics Sync Tracker
Automatically injects the Zolytics analytics tracker into all Zo Space page routes.

Usage:
  python3 sync-tracker.py                  # Sync all page routes
  python3 sync-tracker.py --dry-run        # Show what would change, no writes
  python3 sync-tracker.py --route /path    # Sync a specific route only
  python3 sync-tracker.py --skip /a,/b    # Skip additional routes
  python3 sync-tracker.py --setup-cron    # Create Zo agent for periodic auto-sync

Run after install.sh to track all current pages, then set up cron for future pages.
"""

import subprocess
import json
import sys
import re
import argparse
import os

# Tracker marker — if present in route code, the route is already tracked
TRACKER_MARKER = "/api/analytics/collect"

# zo.space stores route files here (server-side)
ROUTES_DIR = "/__substrate/space/routes/pages"

# Tracker snippet (JSX inline script, no external dependencies)
TRACKER_SNIPPET = (
    '<script dangerouslySetInnerHTML={{ __html: `'
    '(function(){var e="/api/analytics/collect";'
    'try{fetch(e,{method:"POST",headers:{"Content-Type":"application/json"},'
    'body:JSON.stringify({path:location.pathname+location.search,'
    'referrer:document.referrer||"direct",viewport_width:window.innerWidth,'
    'timestamp:new Date().toISOString()}),keepalive:true}).catch(function(){});}'
    'catch(x){}})()` }} />'
)

# code_edit: insert tracker before the final closing </div> of the JSX return
TRACKER_CODE_EDIT = (
    "// ... existing code ...\n"
    "      " + TRACKER_SNIPPET + "\n"
    "    </div>\n"
    "  );\n"
    "}"
)

TRACKER_EDIT_INSTRUCTIONS = (
    "Add a Zolytics analytics tracker <script> tag as the LAST child element "
    "inside the main component's return statement, immediately before the final "
    "closing </div> tag of the outermost div in the return. "
    "Do not change any other code. Do not add it inside data constants, style blocks, "
    "or template literals — only inside the JSX return statement."
)

# Routes to always skip (internal routes, not public pages)
DEFAULT_SKIP = {
    "/analytics",
    "/api/analytics/collect",
    "/api/analytics/query",
}

# Cron agent config — free model, 30-min interval
CRON_AGENT_RRULE = "FREQ=MINUTELY;INTERVAL=30"
CRON_AGENT_INSTRUCTION = (
    "Run the Zolytics tracker sync to ensure all Zo Space pages are tracked. "
    "Execute: python3 /home/workspace/zolytics/sync-tracker.py\n"
    "This script checks all page routes and injects the Zolytics analytics tracker "
    "into any pages that are missing it. Report back with the summary output."
)
CRON_AGENT_MODEL = "vercel:minimax/minimax-m2.5"


def run_mcporter(args, timeout=120):
    cmd = ["/usr/bin/mcporter", "call"] + args
    result = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout)
    return result.stdout.strip(), result.stderr.strip(), result.returncode


def _path_to_filename(route_path):
    """
    Convert a route path like /zoey/blog/2026-03-14 to a filename.
    zo.space uses: / → _home, /foo → foo, /foo/bar → foo-bar (hyphens for slashes)
    """
    if route_path == "/":
        stem = "_home"
    else:
        stem = route_path.lstrip("/").replace("/", "-")
    # Try both .tsx and .jsx
    for ext in [".tsx", ".jsx"]:
        fname = os.path.join(ROUTES_DIR, stem + ext)
        if os.path.exists(fname):
            return fname
    # Return most likely path even if not found
    return os.path.join(ROUTES_DIR, stem + ".tsx")


def route_has_tracker_fs(route_path):
    """
    Check if the tracker is present using the local filesystem (reliable for large files).
    Returns True/False/None (None = file not found).
    """
    fpath = _path_to_filename(route_path)
    try:
        with open(fpath, "r") as f:
            return TRACKER_MARKER in f.read()
    except FileNotFoundError:
        return None
    except Exception:
        return None


def list_page_routes():
    stdout, stderr, code = run_mcporter(["zo.list_space_routes"])
    if not stdout.startswith("["):
        print(f"  ERROR: Failed to list routes: {stdout}", file=sys.stderr)
        sys.exit(1)
    try:
        routes_raw = json.loads(stdout)
    except json.JSONDecodeError:
        print(f"  ERROR: Failed to parse routes JSON:\n{stdout}", file=sys.stderr)
        sys.exit(1)

    page_routes = []
    for entry in routes_raw:
        path_match = re.search(r"path='([^']+)'", entry)
        type_match = re.search(r"route_type='([^']+)'", entry)
        if path_match and type_match:
            path = path_match.group(1)
            rtype = type_match.group(1)
            if rtype == "page":
                page_routes.append(path)
    return page_routes


def route_has_tracker(route_path):
    """
    Check if the tracker is present. Uses filesystem for reliability (handles large pages).
    Falls back to API check if filesystem path not found.
    Returns True/False/None (None = cannot determine).
    """
    # Try filesystem first (fast, handles large files)
    fs_result = route_has_tracker_fs(route_path)
    if fs_result is not None:
        return fs_result

    # Fall back to API (may be truncated for large pages)
    stdout, stderr, code = run_mcporter(["zo.get_space_route", f"path={route_path}"])
    if not stdout.startswith("path='"):
        return None
    return TRACKER_MARKER in stdout


def _inject_tracker_into_code(code):
    """
    Programmatically insert the tracker snippet into JSX code.
    Finds the rightmost '    </div>\\n  );\\n}' pattern and inserts tracker before it.
    Returns modified code, or None if pattern not found.
    """
    candidates = [
        "\n    </div>\n  );\n}",
        "\n    </div>\n  );\n}\n",
    ]
    for pattern in candidates:
        idx = code.rfind(pattern)
        if idx >= 0:
            injection = "\n      " + TRACKER_SNIPPET
            return code[:idx] + injection + code[idx:]
    return None


def inject_tracker(path):
    """
    Inject the tracker into a page route.
    Strategy:
    1. LLM code_edit (preferred — works for most pages, preserves concurrent edits)
    2. If code_edit verification fails, try direct filesystem injection
    Returns True on success.
    """
    # Attempt 1: LLM-based code_edit
    stdout, stderr, rc = run_mcporter([
        "zo.update_space_route",
        f"path={path}",
        "route_type=page",
        f"code_edit={TRACKER_CODE_EDIT}",
        f"edit_instructions={TRACKER_EDIT_INSTRUCTIONS}",
    ], timeout=180)

    if not (stdout.startswith("Error:") or "\nError:" in stdout):
        # Verify using filesystem (reliable even for large files)
        if route_has_tracker(path):
            return True

    # Attempt 2: Direct filesystem injection (fallback for pages where code_edit failed)
    fpath = _path_to_filename(path)
    if not os.path.exists(fpath):
        print(f"  ERROR: No local file found for {path} (looked for {fpath})", file=sys.stderr)
        return False

    with open(fpath, "r") as f:
        code = f.read()

    if TRACKER_MARKER in code:
        return True  # Race condition — already injected

    new_code = _inject_tracker_into_code(code)
    if new_code is None:
        print(f"  ERROR: Could not find injection point in {path}", file=sys.stderr)
        return False

    # Deploy via mcporter with full code (Python subprocess, no shell arg limits)
    deploy_stdout, deploy_stderr, deploy_rc = run_mcporter([
        "zo.update_space_route",
        f"path={path}",
        "route_type=page",
        f"code={new_code}",
    ], timeout=180)

    if deploy_stdout.startswith("Error:") or "\nError:" in deploy_stdout:
        print(f"  ERROR: Deploy failed for {path}: {deploy_stdout}", file=sys.stderr)
        return False

    return route_has_tracker(path) is True


def setup_cron_agent():
    print(f"  [zolytics] Creating Zo agent for periodic tracker sync (every 30 min)...")
    stdout, stderr, code = run_mcporter([
        "zo.create_agent",
        f"rrule={CRON_AGENT_RRULE}",
        f"instruction={CRON_AGENT_INSTRUCTION}",
        f"model={CRON_AGENT_MODEL}",
    ], timeout=60)

    if stdout.startswith("Error:") or (code != 0 and not stdout):
        print(f"  ERROR: Failed to create cron agent: {stdout or stderr}", file=sys.stderr)
        return False

    print(f"  Cron agent created — sync-tracker.py runs every 30 minutes")
    if stdout:
        print(f"    {stdout[:300]}")
    return True


def main():
    parser = argparse.ArgumentParser(
        description="Zolytics Sync Tracker — auto-inject analytics into all Zo Space pages"
    )
    parser.add_argument("--dry-run", action="store_true",
                        help="Show what would change without writing")
    parser.add_argument("--route", help="Only process this specific route path")
    parser.add_argument("--skip", help="Comma-separated extra paths to skip")
    parser.add_argument("--setup-cron", action="store_true",
                        help="Create Zo agent to run this script every 30 minutes")
    args = parser.parse_args()

    print()
    print("  Zolytics Sync Tracker")
    if args.dry_run:
        print("  [DRY RUN - no changes will be made]")
    print()

    if args.setup_cron:
        setup_cron_agent()
        print()

    skip = DEFAULT_SKIP.copy()
    if args.skip:
        for p in args.skip.split(","):
            skip.add(p.strip())

    if args.route:
        routes = [args.route]
    else:
        print("  [zolytics] Fetching all Zo Space page routes...")
        routes = list_page_routes()
        print(f"  [zolytics] Found {len(routes)} page routes")
    print()

    injected = 0
    already_tracked = 0
    skipped = 0
    errors = 0

    for path in routes:
        if path in skip:
            print(f"    - {path}  [skipped]")
            skipped += 1
            continue

        has = route_has_tracker(path)

        if has is None:
            print(f"    ? {path}  [fetch error, skipping]")
            errors += 1
            continue

        if has:
            print(f"    = {path}  [already tracked]")
            already_tracked += 1
            continue

        if args.dry_run:
            print(f"    + {path}  [would inject tracker]")
            injected += 1
        else:
            print(f"    + {path}  injecting...", end="", flush=True)
            ok = inject_tracker(path)
            if ok:
                print("  done")
                injected += 1
            else:
                print("  FAILED")
                errors += 1

    print()
    print("  Summary:")
    print(f"    Injected:        {injected}")
    print(f"    Already tracked: {already_tracked}")
    print(f"    Skipped:         {skipped}")
    if errors:
        print(f"    Errors:          {errors}")
    print()

    if errors:
        sys.exit(1)


if __name__ == "__main__":
    main()
