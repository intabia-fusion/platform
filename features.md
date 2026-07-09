
# Features

Changes in this fork relative to `upstream/develop` (hcengineering/platform).

## Chat

We fixed a lot of issues with chat + notifications, and did great work on inbox improvements (some still in progress).

**Reply / Forward**
- **Reply to message** - reply action on any message, with quoted preview in composer and a reply presenter.
- **Forward a message** - forward action pushes a message to another channel or direct chat (`ForwardMessageDialog`, forwarded-message presenter). Note: targets channels/DMs only - forwarding into an arbitrary document/card is not implemented.
- Hardening: reply draft preserved on reopen, attachment opening from reply/forward, forwarded text no longer erased, sender header shown after a reply, input not cleared while a message is still sending.

**Read receipts (who sees my message)**
- Single/double check marks per message + "who has read this" popup (`MessageReadMarker`, `MessageReadPopup`; client + server middleware + migrations).
- Mark-as-read directly from Inbox.

**Chat UX**
- Change a channel's icon/emoji; search inside chat navigator; separate Channels & DMs browser tab.
- Filter archived chats, hide inaccessible directs, deduplicate direct-message channels.
- Double-click a message opens its thread with scroll/focus synced to URL; unread-indicator fixes (gray/red dots).
- Performance: chat load slowness fix; server-side activity aggregation for faster history/scroll.

**Notification controls**
- Mute chat notifications; disable chat unread badge; disable "collaborators" notifications separately.
- Dedicated web-push preferences page; hide empty notification groups; card notification sub-groups.
- Push deep-links open correct thread/message; per-recipient localized email notifications; cross-workspace unread marker on desktop app icon; Windows taskbar unread badge fix.

**Inbox - in progress**
- Selection preserved after deleting an item; grouped list-view rework; notifications removed (not archived) storage model rework.

## Office

- **Per-meeting notes security** - `MeetingMinutes` is now a full Space with private/owners/members. Hosts can lock a meeting; only owners change privacy, owners, or member list. Private meetings show a "Busy" badge to non-members and hide meeting details.
- **Guests join via external link** - shared external link lets guests join a meeting with no account (works in incognito); short shareable meeting links; scheduled-meeting join tied to calendar events with a guest waiting state.
- **Reworked invite / knock flow** - live "Knocking" / "You are inviting" indicators, accept/decline/cancel popups, multi-owner knock fanout (any owner admits), knock-to-join for personal offices, workspace-owner self-join into private meetings.
- Robust lifecycle: invite/knock UI auto-expires via TTL + heartbeat (~30s failsafe) on abrupt tab close; meeting auto-closes when only guests remain or last participant leaves; office-owner leaving cascade-disconnects all.
- **Re-worked transcription (local audio to text)** - pluggable STT provider: run against a self-hosted OpenAI-compatible Whisper server instead of only cloud STT (Deepgram/OpenAI). VAD (silence filtering), word-level timestamps, per-room transcription settings, reworked audio player with transcript/timestamp sync (`packages/audio-dsp` noise reduction + FFT).
- **Re-worked LiveKit integration** - support for self-hosted LiveKit installations (configurable URL / API key / secret, not locked to LiveKit Cloud); LiveKit client updated.
- Office/floor UI rework (room display, avatar sizing, office editing); AI meeting summary improvements; 1:1 meetings default to Video type.
- Note: Krisp noise-cancellation was disabled in this fork.

## Tracker

- **Show parent + related issues as a list** (in progress) - parent and dependent/related issues now rendered as a list; adds a parent-issue presenter for list/kanban views.
- **Time reports** - reworked time-report list, estimation stats/progress presenters, time-spend report UI; 15/30-minute increments for logged time.
- **Improved time tracking** - improved time-reporting dialog/flow; reworked estimation popup, progress circle, sub-issue estimation list.
- **Kanban fixes + swim-lanes** - swim-lanes in Kanban, parent-based swimlane grouping, drag/drop between columns/lanes, "show more" layout, custom attributes on cards, milestone selector fix.
- Fixes: issue type reset on create, sub-issue defaults/labels, viewlet jump, header colors.

## Documents / QMS

- **Copy Document as Markdown** - context-menu / toolbar action to copy a document as markdown (FUSIO-777).
- Controlled documents: file attachments copied when creating a document from a template and when drafting a new version (prior attachments carried over, except those marked deleted); attachment state tracking (referenced / deleted-in-version) + file preview in the document attachment list.

## Contact

- Fulltext search in contact / attribute filters (search instead of exact match).
- Improved social-identity presenter in contact UI.
- Filter forbidden (blocked / hidden) communication channels in contact UI (FUSIO-927).

## Settings

- Disable any plugin / feature via `DISABLED_FEATURES` - hides its settings categories (contact / love / billing / relations etc.).
- Simplified invite form (removed role selector / link management); Guest Access block shown only when readonly guests are allowed at account level.
- Removed Classes tab, hidden Spaces section, logo removed from account settings.

## Billing

- Stripe integration: checkout, webhooks, subscription status mapping.
- Billing statistics dashboard; "My cards" payment management UI.
- Token / usage limit display for AI; billing disabled when no billing URL configured.

## AI Bot

- AIBot rework: runs as a REST server, Kafka-backed, with storage-backed memory (personal + shared); responds to mentions.
- Gigachat model support; strip think-blocks from responses; recursion fix, logging; new bot avatar.

## Login / Onboarding

- OTP-based signup / login flow; phone-number field at registration.
- Consent documents + consent checkboxes on signup; Terms of Use / Copyright footer.
- Expired-invite-link handling; login page theme rework (accent colors, light/dark).

## Platform

- Web push: subscribe controls + device list; expanded Help & Support; new-message indicator in the app panel; cross-workspace unread marker in workspace selector.
- Light/dark theme + accent color customization; new accent color; spellcheck toggle in editors; custom attributes in list views.
- Text editor: undo (Ctrl+Z) in the drawing board; improved mentions ordering.
- Calendar: default calendar renamed HULY -> Default.
- Backup/restore: account domain (person / socialId) restore; skip-queue option; fix backup of wrong social ids.
- region config for data residency; published API package; desktop macOS signing + Windows build fixes.
- Removed modules: Bitrix integration and Board (Kanban board plugin) dropped from the fork.
