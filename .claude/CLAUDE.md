Please read AGENTS.md in the repository root first.

## Session Memory (docs/memory)

Each session: capture important project moments into `docs/memory/<topic>.md`.
- Record non-obvious decisions, root causes, edge cases, integration quirks discovered during the session
- One file per topic; update incrementally, keep concise
- Follow `AGENTS.md` "Documentation Policy" — skip obvious behavior and trivial setup
- Before starting work, scan `docs/memory/` for relevant existing notes

## Translations

A new or changed i18n key goes into EVERY locale file of that `lang/` directory in the same change,
not only `en.json`/`ru.json`. A missing key falls back to English silently, so nothing fails and the
gap ships. Keep placeholders, HTML tags and ICU plural categories per language. Delegate the bulk
translation to a Sonnet sub-agent.

## Sub-agents with Sonnet

Prefer spawning sub-agents with `model: "sonnet"` for tasks that fit:
- Codebase exploration, search, file discovery (Explore agent)
- Bulk reads, research, multi-file summarization
- Independent parallel lookups
- Routine refactors with clear scope

Keep main model for: architectural decisions, tricky debugging, security-sensitive code, final review.
Pass self-contained prompts with file paths and explicit scope.
