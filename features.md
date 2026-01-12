# Functional changes in this fork (commit-based summary)

This file summarizes the key *functional* differences between this fork (`foundation`) and upstream (`hcengineering/platform`), derived from commits that are present locally but not in `upstream/develop`.  
Per your request, changes that are purely infrastructure or development tooling (Docker/base images, CI/workflows, build scripts, packaging, developer helpers) are explicitly excluded from this summary.

How this summary was produced
- Compare commits in range: `upstream/develop..develop`.
- Exclude commits that only change infra/dev paths (e.g. `dev/`, `.github/`, `dev/base-image/`, scripts, Dockerfiles, CI config).
- Group remaining commits by functional categories and surface representative commits and files.
- For a machine-readable helper and to reproduce: see `scripts/summarize-commits.py` and the full per-file patch index `diff/diff-log.md`.

Snapshot (example numbers)
- Commits in range (total): ~180
- Commits excluded as infra/dev-only: ~47
- Functional commits summarized below (remaining commits)

---

## AI / AIBot
What changed
- Refactored AIBot to support additional LLM providers (GigaChat), added provider implementation and configuration.
- Switched parts of AIBot to REST-style integrations and improved logging and workspace handling.
Representative commits
- `204ac8d` Refactoring AIBot to support GigaChat
- `7c407ab` AIBot using REST APIs
- `49fbda1` Add more logging to AIBot / love-agent
Representative file (provider code)
```foundation/services/ai-bot/pod-ai-bot/src/llms/gigachat.ts#L36-48
this.client = new GigaChat({
  credentials: config.GigaChatCredentials ?? '',
  scope: config.GigaChatScope ?? 'GIGACHAT_API_PERS',
  model: config.GigaChatModel ?? 'GigaChat',
  baseUrl: config.GigaChatBaseUrl ?? 'https://gigachat.devices.sberbank.ru/api/v1/',
  timeout: config.GigaChatTimeout != null ? parseInt(config.GigaChatTimeout) : 600
})
```

Why it matters
- Broader LLM provider support and more resilient AIBot pipelines; improvements in logging help debugging and production observability.

---

## Recording / Transcription / Datalake
What changed
- Improved handling of recordings and storage of transcription chunks.
- Datalake fixes and S3/stream buffer adjustments to make uploads and custom locations more robust.
Representative commits
- `8fdecbd` Office recordings and transcriptions
- `1a46076` Use separate storage for transcription chunks
- `e28e71c` Fix datalake for custom locations
Representative files
- `foundations/server/packages/server-storage/src/starter.ts`
- `services/datalake/pod-datalake/src/datalake/*`

Why it matters
- More reliable recording ingestion and transcription storage; better support for custom datalake/S3 setups and large uploads.

---

## UI / Chat / Presentation
What changed
- Significant UI/UX improvements for chat, replies, and activity messages.
- Added confirmation dialog on message deletion and cleaned up search/navigation in message components.
Representative commits
- `97bd5eb` Add chat presenters updates
- `bc310ec` Add confirmation dialog on message delete
- `cdc90c82` Remove extra search
Representative files
- `plugins/activity-resources/src/components/*`
- `packages/presentation/src/components/MessageBox.svelte`

Why it matters
- Better user experience for messaging workflows and reply interactions.

---

## Billing & Usage
What changed
- UI and backend fixes for billing visibility and usage calculations, including token limit display and workspace filtering.
Representative commits
- `a90f785` Add token limit display
- `9ce63ae` Check only visited workspaces in billing
Representative files
- `plugins/billing-resources/*`
- `services/billing/pod-billing/src/usage.ts`

Why it matters
- Improved accuracy and visibility in billing/usage for end users and admins.

---

## Audio / DSP
What changed
- New audio DSP package and tests (FFT, noise reduction, WAV utilities).
- Stabilized audio player behavior in UI.
Representative commits
- `c42c6ff` Audio DSP (package addition)
- `135adab` Disable dev mode for audio player
Representative artifact
```foundation/diff/packages/audio-dsp/src_fft.ts.diff#L1-8
diff --git a/packages/audio-dsp/src/fft.ts b/packages/audio-dsp/src/fft.ts
new file mode 100644
@@ -0,0 +1,437 @@
+/** FFT implementation and utilities **/
```

Why it matters
- Foundational audio processing building blocks for features like transcription, voice processing, and audio analytics.

---

## Core / Server
What changed
- Multiple fixes and improvements across server components: session manager, middleware, queue/kafka handling and storage adapters.
Representative commits
- `7c407ab` Aibot using REST APIs (also touches server/middleware and session manager)
- `1f38503` Set requestStreamBufferSize to 32K for S3 stream upload
- `da4b59e` Batch processing / queue improvements

Why it matters
- Improved stability and correctness in core server operations and background processing.

---

## Tests & Quality
What changed
- Substantial test fixes and quality improvements (sanity tests, ws-tests, svelte-check, test documentation).
Representative commits
- `e051d0d` Test fixes
- `69c7a29` Fix svelte-check and tests
- `ad874af` Add tests README

Why it matters
- Reduces flaky behavior and makes the repository safer to change and upgrade.

---

## Removals & Cleanup
What changed
- Removal of legacy/unused integrations to simplify the platform surface:
  - Bitrix/Board integrations and related assets removed (cleanup commit).
Representative commit
- `bcd21243` Remove bitrix and board

Why it matters
- Less maintenance burden, fewer external integration points to manage for users who do not require Bitrix/Board.

---

## Other notable items
- `clisr` tooling and tests were added/improved (improves developer tooling for runtime/test automation).
- Small usability and bug fixes across many plugins (login UX, token display, left-panel sizing, encoding fixes).

---

## Verify / Reproduce
- Fetch upstream and run the summarizer:
  - `git fetch upstream`
  - `python3 scripts/summarize-commits.py --format md`  (helper that filters infra-only commits and groups results)
- Or inspect commits directly:
  - `git log --no-merges --pretty=format:"%h %ad %s" --date=short upstream/develop..develop`
  - For per-commit files: `git show --name-only <sha>`
