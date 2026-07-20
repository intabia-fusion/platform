Please read AGENTS.md in the repository root first.

## Session Memory (docs/memory)

Each session: capture important project moments into `docs/memory/<topic>.md`.
- Record non-obvious decisions, root causes, edge cases, integration quirks discovered during the session
- One file per topic; update incrementally, keep concise
- Follow `AGENTS.md` "Documentation Policy" — skip obvious behavior and trivial setup
- Before starting work, scan `docs/memory/` for relevant existing notes

## Sub-agents with Sonnet

Prefer spawning sub-agents with `model: "sonnet"` for tasks that fit:
- Codebase exploration, search, file discovery (Explore agent)
- Bulk reads, research, multi-file summarization
- Independent parallel lookups
- Routine refactors with clear scope

Keep main model for: architectural decisions, tricky debugging, security-sensitive code, final review.
Pass self-contained prompts with file paths and explicit scope.
