#!/usr/bin/env python3
"""
summarize-commits.py

Helper script to summarize logical commits present in the current repository
relative to an upstream range (default: upstream/develop..develop), group them
into human-friendly categories and output a short Markdown (or JSON/TXT) report.

Primary purpose:
- List commits that are in `range` and not in the upstream range,
- Exclude infra/dev-only commits by default (configurable),
- Group commits into categories relevant for consumer-facing change lists
  (AI, Recording, Audio/DSP, UI/Chat, Billing, Core/Server, Removals, Tests),
- Produce a compact summary useful for updating `features.md` (or other docs).

Usage:
    python3 scripts/summarize-commits.py \
        --range "upstream/develop..develop" \
        --out changes-summary.md \
        --format md \
        --exclude-infra

Notes:
- The script requires `git` available on PATH and should be run from the repository root
  (or pass --repo-root).
- It does not fetch from remotes automatically. If upstream refs are missing, run:
    git fetch upstream
"""
from __future__ import annotations

import argparse
import json
import os
import re
import shlex
import subprocess
import sys
from collections import defaultdict, Counter
from dataclasses import dataclass
from pathlib import Path
from textwrap import dedent
from typing import Dict, Iterable, List, Optional, Set, Tuple

# -----------------------------------------------------------------------------
# Configuration: categories -> list of match patterns (checked against paths & commit messages)
# Order matters: first matching category is used as the primary category for a commit.
# -----------------------------------------------------------------------------
CATEGORY_PATTERNS: Dict[str, List[str]] = {
    "AI / AIBot": ["services/ai-bot", "pod-ai-bot", "ai-bot", "gigachat", "llm"],
    "Recording / Transcription": ["services/datalake", "services/love", "transcript", "transcription", "server-storage", "datalake"],
    "Audio / DSP": ["packages/audio-dsp", "audio-dsp", "fft", "whisper", "audio player", "audio"],
    "UI / Chat / Presentation": ["plugins/activity-resources", "plugins/chunter-resources", "packages/presentation", "packages/ui", "desktop/src/ui", "MessageBox.svelte", "Replies.svelte", "chat"],
    "Billing & Usage": ["models/billing", "services/billing", "plugins/billing-resources", "usage", "token limit", "billing"],
    "Core / Server": ["foundations/server", "foundations/core", "server/", "sessionManager", "queue", "kafka", "postgres", "middleware"],
    "Removals & Cleanup": ["models/bitrix", "plugins/bitrix", "board", "remove bitrix", "remove board"],
    "Tests & Quality": ["tests/", "qms-tests", "ws-tests", "fix test", "test fixes", "svelte-check"],
}

# Files/paths considered "infra/dev" (when excluding infra-only commits)
INFRA_PATTERNS: List[str] = [
    r"^dev(/|$)",
    r"^common/scripts/",
    r"^\.github/",
    r"^dev/base-image/",
    r"Dockerfile$",
    r"(^|/)\.nvmrc$",
    r"^scripts/",
    r"^templates/",
    r"^rush\.json$",
    r"pnpm",
    r"^package-lock\.json$",
    r"^\.vscode/",
    r"^dev/pgbouncer/",
    r"^dev/local-mongo/",
    r"(^|/)(?:ci|docker|image)s?/.*",  # generic image/ci files
]

# Compile regexes for faster matching
_compiled_infra = [re.compile(p, flags=re.IGNORECASE) for p in INFRA_PATTERNS]
_compiled_cat = {cat: [re.compile(re.escape(p), flags=re.IGNORECASE) for p in pats] for cat, pats in CATEGORY_PATTERNS.items()}


# -----------------------------------------------------------------------------
# Data classes
# -----------------------------------------------------------------------------
@dataclass
class CommitInfo:
    sha: str
    short_sha: str
    subject: str
    author: str
    date: str
    files: List[str]


# -----------------------------------------------------------------------------
# Git helpers
# -----------------------------------------------------------------------------
def run_git(args: List[str], repo_root: Optional[Path] = None) -> str:
    cmd = ["git"] + args
    try:
        out = subprocess.check_output(cmd, cwd=str(repo_root) if repo_root else None, stderr=subprocess.STDOUT, text=True)
        return out
    except subprocess.CalledProcessError as e:
        raise RuntimeError(f"Git command failed: {' '.join(cmd)}\n\n{e.output.strip()}") from e


def list_commits(range_spec: str, repo_root: Optional[Path] = None, include_merges: bool = False) -> List[str]:
    args = ["rev-list", range_spec]
    if not include_merges:
        args.insert(1, "--no-merges")
    out = run_git(args, repo_root)
    shas = [line.strip() for line in out.splitlines() if line.strip()]
    return shas


def get_commit_meta(sha: str, repo_root: Optional[Path] = None) -> Tuple[str, str, str]:
    # subject, author, date (short)
    fmt = "%s%x1f%an%x1f%ad"
    out = run_git(["log", "-1", f"--pretty=format:{fmt}", "--date=short", sha], repo_root)
    parts = out.strip().split("\x1f")
    if len(parts) >= 3:
        return parts[0], parts[1], parts[2]
    return parts[0] if parts else sha, "unknown", "unknown"


def get_commit_files(sha: str, repo_root: Optional[Path] = None) -> List[str]:
    # Using diff-tree to get list of files touched by the commit
    out = run_git(["diff-tree", "--no-commit-id", "--name-only", "-r", sha], repo_root)
    files = [line.strip() for line in out.splitlines() if line.strip()]
    return files


def sanitize_subject(subject: str) -> str:
    """
    Remove 'Signed-off-by:' footers from commit subjects and trim whitespace.
    """
    return re.sub(r'\s*Signed-off-by:.*$', '', subject).strip()


# -----------------------------------------------------------------------------
# Categorization & infra checks
# -----------------------------------------------------------------------------
def is_infra_file(path: str) -> bool:
    for rx in _compiled_infra:
        if rx.search(path):
            return True
    return False


def commit_is_infra_only(files: Iterable[str]) -> bool:
    files = list(files)
    if not files:
        return True
    for f in files:
        if not is_infra_file(f):
            return False
    return True


def categorize_commit(files: Iterable[str], subject: str) -> str:
    """
    Return a category name for the commit. Priority is the order in CATEGORY_PATTERNS.
    If no category matches, return 'Other'.
    """
    text = "\n".join(files) + "\n" + subject
    for cat, patterns in _compiled_cat.items():
        for rx in patterns:
            if rx.search(text):
                return cat
    return "Other"


# -----------------------------------------------------------------------------
# Output formatting
# -----------------------------------------------------------------------------
def format_markdown_summary(commits_by_cat: Dict[str, List[CommitInfo]], total_commits: int, filtered_out: int, max_examples: int = 10) -> str:
    lines = []
    lines.append("# Summary of commits vs upstream")
    lines.append("")
    lines.append(dedent(f"""
    - Range analyzed: **{args.range}**
    - Total commits in range: **{total_commits}**
    - Commits skipped (infra/dev only): **{filtered_out}**
    """).strip())
    lines.append("")
    lines.append("## Highlights by category")
    lines.append("")
    for cat, commits in commits_by_cat.items():
        if not commits:
            continue
        lines.append(f"### {cat} — {len(commits)} commit(s)")
        lines.append("")
        for c in commits[:max_examples]:
            sample = ", ".join(c.files[:4]) + ("..." if len(c.files) > 4 else "")
            lines.append(f"- `{c.short_sha}` **{c.subject}** — {sample}")
        if len(commits) > max_examples:
            lines.append(f"- _...and {len(commits) - max_examples} more commits in {cat}_")
        lines.append("")
    # Footer
    lines.append("---")
    lines.append("")
    lines.append("For a full per-commit/per-file list you can use `git` directly, or export JSON via `--format json`.")
    return "\n".join(lines)


def format_text_summary(commits_by_cat: Dict[str, List[CommitInfo]], total_commits: int, filtered_out: int) -> str:
    lines = []
    lines.append(f"Commits vs upstream ({args.range})")
    lines.append(f"Total: {total_commits}, filtered infra-only: {filtered_out}")
    lines.append("")
    for cat, commits in commits_by_cat.items():
        if not commits:
            continue
        lines.append(f"{cat} ({len(commits)})")
        for c in commits:
            lines.append(f"  - {c.short_sha} {c.subject}")
        lines.append("")
    return "\n".join(lines)


# -----------------------------------------------------------------------------
# Main
# -----------------------------------------------------------------------------
def parse_cli() -> argparse.Namespace:
    p = argparse.ArgumentParser(description="Summarize commits relative to upstream and group them into categories.")
    p.add_argument("--range", default="upstream/develop..develop", help="Git range to analyze (default: upstream/develop..develop)")
    p.add_argument("--repo-root", default=".", help="Repository root (default: current directory)")
    p.add_argument("--exclude-infra", dest="exclude_infra", action="store_true", default=True, help="Exclude infra/development-only commits (default: True)")
    p.add_argument("--include-merges", dest="include_merges", action="store_true", default=False, help="Include merge commits")
    p.add_argument("--format", choices=["md", "txt", "json"], default="md", help="Output format (default: md)")
    p.add_argument("--out", default=None, help="Write output to file (default: stdout)")
    p.add_argument("--max-examples", type=int, default=8, help="Max examples per category in markdown output")
    p.add_argument("--verbose", "-v", action="store_true", help="Verbose output")
    return p.parse_args()


def main(argv: Optional[List[str]] = None) -> int:
    global args
    args = parse_cli()
    repo_root = Path(args.repo_root).resolve()

    # Quick sanity checks
    try:
        _ = run_git(["rev-parse", "--is-inside-work-tree"], repo_root)
    except RuntimeError as e:
        print(f"Error: not a git repository or git unavailable: {e}", file=sys.stderr)
        return 2

    # Try to ensure upstream exists (warn if not)
    try:
        run_git(["rev-parse", "--verify", "upstream/develop"], repo_root)
    except RuntimeError:
        print("Warning: `upstream/develop` is not found. Make sure you ran `git fetch upstream` or set the upstream remote.", file=sys.stderr)

    # Collect commits
    try:
        commit_shas = list_commits(args.range, repo_root, include_merges=args.include_merges)
    except RuntimeError as e:
        print(f"Failed to list commits for range {args.range}:\n{e}", file=sys.stderr)
        return 3

    total_commits = len(commit_shas)
    filtered_out = 0

    commits_by_cat: Dict[str, List[CommitInfo]] = defaultdict(list)
    for sha in commit_shas:
        try:
            subject, author, date = get_commit_meta(sha, repo_root)
            files = get_commit_files(sha, repo_root)
        except RuntimeError as e:
            print(f"[warn] skipping commit {sha[:7]} due to git error: {e}", file=sys.stderr)
            continue

        # Sanitize subject: remove Signed-off-by footers
        subject = sanitize_subject(subject)

        # Skip 'Merge remote-tracking' commits even when merges are included
        if re.match(r'(?i)^merge remote-tracking', subject):
            filtered_out += 1
            continue

        # Check infra-only
        if args.exclude_infra and commit_is_infra_only(files):
            filtered_out += 1
            continue

        # Categorize
        cat = categorize_commit(files, subject)
        ci = CommitInfo(
            sha=sha,
            short_sha=sha[:7],
            subject=subject,
            author=author,
            date=date,
            files=files,
        )
        commits_by_cat[cat].append(ci)

    # Build output
    if args.format == "md":
        out_text = format_markdown_summary(commits_by_cat, total_commits, filtered_out, max_examples=args.max_examples)
    elif args.format == "txt":
        out_text = format_text_summary(commits_by_cat, total_commits, filtered_out)
    else:
        # JSON output
        payload = {
            "range": args.range,
            "total_commits": total_commits,
            "filtered_out": filtered_out,
            "categories": {
                cat: [
                    {
                        "sha": c.sha,
                        "short": c.short_sha,
                        "subject": c.subject,
                        "author": c.author,
                        "date": c.date,
                        "files": c.files,
                    }
                    for c in commits
                ]
                for cat, commits in commits_by_cat.items()
            },
        }
        out_text = json.dumps(payload, indent=2)

    # Write or print
    if args.out:
        out_path = Path(args.out)
        out_path.write_text(out_text, encoding="utf-8")
        print(f"Wrote summary to {out_path}")
    else:
        print(out_text)

    return 0


if __name__ == "__main__":
    sys.exit(main())
