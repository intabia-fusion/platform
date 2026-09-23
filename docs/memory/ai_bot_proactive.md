# Проактивная Юля: welcome, авто-резюме митинга

Область: [AI](../features/ai.md)

## Бот может отсутствовать в пространстве

Цепочка ленивая: `QueueWorkspaceEvent.Up` -> `AIControl.connect` -> `createWorkspaceClient` -> `tryAssignToWorkspace` (`utils/account.ts`) -> `ensureEmployee`. Пока под не получил `Up`, `openBotDirect` (`plugins/chunter-resources/src/utils.ts`) молча выходит - кнопка есть, реакции нет. Welcome поэтому идёт двумя путями: триггер для новых сотрудников + `backfillWelcomeDirects` (`workspace/workspaceClient.ts`, вызывается из `initClient`) для существующих.

`getDirect` (`utils/platform.ts`) - мёртвый код, 0 вызовов: Direct с ботом создаётся только через `openBotDirect`.

## Текст приветствия - welcome.yaml, не i18n

Текст живёт в `services/ai-bot/pod-ai-bot/welcome.yaml` (`WELCOME_PATH` env > cwd > корень пакета), не в транзакторе - i18n-строка требовала бы регистрации `ai-bot-assets` и пересборки на правку текста. `pickWelcome` даёт fallback `pt-br -> pt -> en`; файла нет - приветствия просто нет, под не падает.

Триггер живёт на `QueueTopic.Tx`: батч-консьюмер группы `ai-bot-welcome` (`queue.ts`) фильтрует `TxMixin` с `mixin === contact.mixin.Employee` и `attributes.active === true` (`queue.ts`) до обращения к клиенту воркспейса - иначе любой tx любого воркспейса поднимал бы pipeline. Идемпотентность - наличие Direct.

## Авто-резюме: три подводных камня

- Хвост STT: `roomFinished` ставит `transcriptionState: Finished`, но чанки ещё в очереди. `waitTranscriptSettled` (`controller.ts`) ждёт, пока `MeetingMinutes.transcription` перестанет расти (`TRANSCRIPT_SETTLE_ATTEMPTS=6` попыток по `TRANSCRIPT_SETTLE_DELAY=5000`мс, `controller.ts`).
- Суммаризация уходит в свой топик `ai-summary` (`SUMMARY_TOPIC`, `queue.ts`), а не держит `LoveQueue`-консьюмер: держать его на время ожидания хвоста значило бы стопорить остальные митинги и рисковать rebalance. `startSummary` (`queue.ts`) разбирает задачу в группе `ai-bot-summary`. Консьюмер поднимается только в ролях с `initLLM` (`all`, `llm-router`); топик создаётся в `startSttIngest` во всех ролях, так что продюсер никогда не пишет в несуществующий топик.
- Ручная кнопка "Суммаризировать" (`POST /summarize`) идёт тем же топиком с `manual: true` - без ожидания хвоста и без гейта настроек.
- `autoSummarizeMeeting` не глотает ошибки - решение о ретрае/dead letter принимает консьюмер; повтор безопасен, `shouldAutoSummarize` отсекает `summary != null`.

Резюме делается только там, где комната писала транскрипт (`transcription > 0`) - транскрипцию не форсируют.

## Голосовые: таймаут ASR

`asrProvider.transcribe` в `processChatVoice` (`transcriptions.ts`) обёрнут в `Promise.race` с таймаутом `CHAT_VOICE_ASR_TIMEOUT_MS=120000` (`transcriptions.ts`) - без него `AudioTranscribe` зависал в `pending` навсегда при недоступном ASR. Ответ бота ждёт транскрипт до `VOICE_TRANSCRIPT_WAIT_MS=60000` (`workspace/workspaceClient.ts`) и при отсутствии текста подставляет в промпт пометку о неудачной расшифровке.

## Связанные документы

- [`../features/ai.md`](../features/ai.md)
- [`ai_bot_context_and_settings.md`](ai_bot_context_and_settings.md)
- [`ai_harness_progress_cancel.md`](ai_harness_progress_cancel.md)
