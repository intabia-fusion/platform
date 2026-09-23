# Clipboard copy pitfalls

Область: [Документы и QMS (controlled documents)](../features/documents-qms.md)

Two failure classes, both end as `NotAllowedError` from `navigator.clipboard.write`:

1. **Unsupported MIME in ClipboardItem.** Browsers accept only `text/plain`, `text/html`, `image/png`. `text/markdown` and custom types (`application/x-platform-table-metadata`) always throw. Markdown is copied as `text/plain`; table metadata is embedded as an HTML comment `<!-- platform-table-metadata:{...} -->` in the text (parsed by text editors on paste).
2. **Await before write loses user gesture (Safari).** `clipboard.write` must run within the user-gesture activation. Fix: create `ClipboardItem` synchronously and pass a *Promise* of the text into it (WebKit-sanctioned pattern, see webkit.org/blog/10855). Both `copyText` (`plugins/view-resources/src/actionImpl.ts`) and `copyTextToClipboard` (`packages/presentation/src/utils.ts`) accept `string | Promise<string>` - callers doing async work (getResource, getMarkup, network fetch) must pass the promise, not await first.

Follow the pattern correctly: `CopyTextToClipboard`, `CopyContentAction`, `copyMarkdown` in `actionImpl.ts`; `copyGuestLink` in `love-resources/src/utils.ts`.

Known residual risks:
- `converter-resources/src/markdown/copyActions.ts`: table markdown is built (awaited) before `copyMarkdown` - OK while builds are fast (in-memory), risky if they start hitting network.
- `calendar-resources/src/components/ScheduleNavSection.svelte`, `shareLink`'s `MessageBox` `action` callback: copy runs inside the confirm callback, not the original click - the gesture from the click that opened the dialog is gone; needs a UX change (direct copy button).
