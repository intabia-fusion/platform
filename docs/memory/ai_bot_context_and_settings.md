# Юля ИИ: контекст разговоров, настройки, модели

Область: [AI](../features/ai.md)

## Контекст по месту

- Top-level в Space (`event.objectIdIsSpace`) - контекст только текущего дня (`modifiedOn >= startOfToday`); тред (`objectIdIsSpace=false`) - весь. Граница резолвится в `workspace/workspaceClient.ts`.
- Триггер сервера собирает событие через `getMessageData` (`server-plugins/ai-bot-resources/src/index.ts`) - тредовой ветки для top-level Direct нет, бот отвечает inline.
- Тул `load_thread_history(beforeIso, limit)` догружает историю старше дня (`WorkspaceClient.loadThreadHistory`).
- Баг (исправлен): `objectIdIsSpace` всегда `boolean`, поэтому `!= null` было всегда true - бот писал `ThreadMessage.space = parentMsg._id` вместо `DirectMessage.space`, а загрузчик чата (сейчас `chatViewport.ts`, тогда `channelDataProvider.ts`) фильтрует по `space`, так что тред казался пустым при непустой БД. Строка - `workspace/workspaceClient.ts`.

## Память всегда в промпте

`get_assistant_memory`/`get_user_memory`/`get_shared_context` в `utils/tools.ts` нет - `assistantMemory`/`userMemory`/`sharedContext` инжектятся в `prompts.yaml` безусловно, а не тулами. Слабые модели без серверного tool-parser (напр. gpt-oss-20b) возвращают function-call текстом (`<|function_call|>{...}`) вместо нативного `tool_calls` - лечится на LLM-сервере (vLLM `--enable-auto-tool-choice --tool-call-parser`, llama.cpp `--jinja`), не в коде ai-bot.

## Реестр моделей (yaml)

- Референс-реестр - `services/ai-bot/pod-ai-bot/config.example.yaml`, не в docker-образе (монтируется деплойментом).
- Dev: `dev/config-aibot.yaml` (server) + `dev/config-aibot-client.yaml` (client).
- Один clisr-клиент обслуживает N моделей: провайдер выбирает модель по `level` через свой реестр (`resolveModel(level).model.model`).
- env-интерполяции `${VAR}` в yaml нет - секреты только литералами.

## UI настроек (plugins/ai-bot-resources)

- Одна settings-категория `ai-settings` (`components/AISettings.svelte`): `AISpaceSettingsEditor` (Basic, readonly не-Owner/Maintainer) + `AIPersonalDataSettings` (Personal).
- `AILanguageSelector.svelte`: `DropdownLabelsIntl` игнорирует пустой id, поэтому опция "Auto" мапится `'auto' <-> ''` на границе компонента.
- Класс `flex-gap-8` не существует (максимум `flex-gap-4`, `packages/theme/styles/_layouts.scss:305`).
- `ui` (`@hcengineering/ui`) - default-импорт, не named (`packages/ui/src/index.ts`).

## free план не блокировался (исправлено)

`resolveWorkspacePlan` (`services/billing/pod-billing/src/billing.ts`) резолвит план как `grantingTier?.plan ?? 'free'` (фильтр `grantsPlan`), не `active?.plan ?? latest?.plan` - иначе unpaid-тир читался по имени как paid и лимит не блокировал free.

## LLM-провайдеры: сетевые ошибки не глотаются

`openai.ts`/`gigachat.ts` оборачивают вызов провайдера в `withRetry(maxRetries: 3, retryNetworkErrors)` (`@hcengineering/retry`) и бросают исключение вместо `catch -> return undefined` - раньше это глушило `ECONNREFUSED`, и запрос тихо повисал без ответа.

## Промпты

- Имя бота унифицировано "Юля" везде (`prompts.yaml`), платформа - "Intabia Fusion".
- `{{currentDateTime}}` и `Always reply in {{lang}}` - в системном промпте (`prompts.yaml`).
- Язык ответа резолвится `resolveChatLanguage` (direct: personal -> space -> workspace -> default; тред: без personal).

## Typing-индикатор

`pulse.class.TypingIndicator` TTL 3с (models/pulse `TransientTTL`); `startTyping` (`workspace/workspaceClient.ts`) освежает документ каждые 2с (< TTL) и возвращает `stop()`.

## Юля online (сессии)

`UserStatus = {online: bool}` без TTL. Бот работает через REST и без явного маркера был бы всегда offline: `addSession` при `token.extra?.service === 'aibot'` ставит online, close-tick пропускает offline для aibot (`foundations/server/packages/server/src/sessionManager.ts`).

## Admin set-usage

`POST /api/v1/admin/:workspace/set-used` (`services/billing/pod-billing/src/server.ts`, `handleSetWorkspaceUsed` -> `billing.ts`) - DELETE usage за месяц + INSERT `total_tokens=value` на выбранном уровне; используется для тестирования биллинга по кейсам.

## Корни контекстов issue-draft (FUSIO-1271)

- `startIssueDraftConversation` (`plugins/ai-bot-resources/src/conversation.ts`) переиспользует пустой корень (`replies===0`, без `resultId`, не archived) и удаляет остальные пустые - панель заводится при открытии, а не на первое сообщение.
- `resetObjectConversation` (`conversation.ts`) архивирует и сразу создаёт новый контекст напрямую (`createObjectContext`), не через `findObjectConversation`: LiveQuery-кэш клиента может вернуть только что заархивированный корень раньше, чем `archived: true` дойдёт broadcast'ом.

## Mock-провайдер через clisr

Мок должен реализовывать `chatToolStep` (`llms/mock.ts`), потому что сервер гоняет `runToolCalls` и ждёт `content`/`toolCalls`; без него нет тулов и в чат ничего не приходит.

## Связанные документы

- [`../features/ai.md`](../features/ai.md)
- [`ai_bot_proactive.md`](ai_bot_proactive.md)
- [`ai_harness_progress_cancel.md`](ai_harness_progress_cancel.md)
