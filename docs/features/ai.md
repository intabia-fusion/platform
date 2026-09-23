# AI-ассистент "Юля ИИ"

> Сверено с кодом: коммит 39ae47eb6f, 2026-09-23.

Встроенный в платформу AI-ассистент: отвечает в чатах (упоминание/Direct), ведёт привязанные к объектам (issue/document) диалоги, транскрибирует голосовые заметки и встречи, суммирует переписку и митинги, предлагает правки документов и задачи - но ничего не применяет сам, только карточкой с кнопкой подтверждения. Сущности: `AIRequest` (статус одного запроса), `AIContextMessage` (диалог), `AISpaceSettings` (уровень модели на пространство), `AudioTranscribe` (голосовая заметка).

Подробное описание устройства, сценариев, harness и деплоя - `../llm.md`, `../ai-harness.md`, `../aibot-deployment.md`, `../aibot.md`, `../aibot-mock-testing.md`. Этот документ - карта "фича -> файл", не дублирует их содержимое, а указывает на разделы и даёт сквозные сценарии для быстрой навигации.

## Где код

| Пакет | Путь | Роль |
| --- | --- | --- |
| `models/ai-bot` | `models/ai-bot/src` | Классы `AIRequest`/`AISpaceSettings`/`AIContextMessage`/`AIEditProposalMessage`/`AITaskProposalMessage`/`AudioTranscribe`/`AIPersonalData`, точки расширения UI |
| `models/server-ai-bot` | `models/server-ai-bot/src` | Регистрация серверных триггеров `OnMessageSend`/`OnAudioTranscribe` |
| `plugins/ai-bot` | `plugins/ai-bot/src` | Протокол клиент<->сервер (`rest.ts`: `AIEventRequest`, `AILevelInfo`, `AIFeatureFlags`), id плагина, декларации UI-компонентов |
| `plugins/ai-bot-resources` | `plugins/ai-bot-resources/src` | UI: диалог с ассистентом, настройки, карточки предложений; `conversation.ts`/`requests.ts`/`exportChat.ts` |
| `plugins/openai` | `plugins/openai/src` | Счётчик токенов tiktoken (`countTokens`), используется `OpenAIProvider` в pod-ai-bot |
| `server-plugins/ai-bot` | `server-plugins/ai-bot/src` | Ресурс-идентификаторы триггеров (`Resource<TriggerFunc>`) |
| `server-plugins/ai-bot-resources` | `server-plugins/ai-bot-resources/src` | Реализация триггеров: роутинг сообщений в Kafka, резолв уровня/языка |
| `services/ai-bot/pod-ai-bot` | `services/ai-bot/pod-ai-bot/src` | Сервис: Kafka-роли, LLM/ASR-провайдеры, harness (tool loop), биллинг, лимиты, REST |
| `services/ai-bot/love-agent` | `services/ai-bot/love-agent/src` | LiveKit job-агент: захват аудио встречи, realtime STT, отправка транскрипта/аудио в pod-ai-bot |

`plugins/ai-assistant`, `plugins/ai-assistant-resources`, `models/ai-assistant` - отдельная подсистема (Settings -> Integrations, коннект "Huly Assistant" через account-интеграции, `SocialIdType.HULY_ASSISTANT`), не часть Юли ИИ; в этот документ не входит.

## Модель данных

| Класс | Смысл | Файл |
| --- | --- | --- |
| `AIRequest` (`TAIRequest`) | Статус одного запроса к LLM (`queued/processing/done/failed/cancelled`), токены, прогресс итераций, флаг компакции | `models/ai-bot/src/index.ts` |
| `AISpaceSettings` (`TAISpaceSettings`) | Настройки AI на space или на весь workspace (`attachedTo` не задан): `level`/`asrLevel`/`language`/`sharedPrompt`/`meetingSummary` | `models/ai-bot/src/index.ts` |
| `AIContextMessage` (`TAIContextMessage`, extends `ChatMessage`) | Корень диалога с ассистентом, привязанного к объекту; переиспользуется при повторном открытии | `models/ai-bot/src/index.ts` |
| `AIEditProposalMessage` (`TAIEditProposalMessage`, extends `ThreadMessage`) | Предложенная ботом правка markup/title; применяет пользователь кнопкой | `models/ai-bot/src/index.ts` |
| `AITaskProposalMessage` (`TAITaskProposalMessage`, extends `ThreadMessage`) | Предложенная задача с подзадачами; issue создаётся только по подтверждению | `models/ai-bot/src/index.ts` |
| `AudioTranscribe` (`TAudioTranscribe`, extends `Attachment`) | Голосовая заметка: состояние/текст/длительность/язык | `models/ai-bot/src/index.ts` |
| `AIPersonalData` (`TAIPersonalData`, extends `Preference`) | Личная память пользователя (`personalContext`, `language`), пишет бот, редактирует пользователь | `models/ai-bot/src/index.ts` |

## Как работает

**1. Ответ бота в чате (упоминание/Direct).**
1. Пользователь пишет сообщение -> `OnMessageSend` (`server-plugins/ai-bot-resources/src/index.ts`) фильтрует свои же tx, резолвит уровень/язык (`applySpaceSettings`/`applyThreadLevel`) и публикует `AIEventRequest` в Kafka `QueueTopic.AIQueue`.
2. `event-router` (`services/ai-bot/pod-ai-bot/src/queue.ts` `startEventRouter`) резолвит провайдера по уровню (`dispatch`, `pipeline.ts`) и перекладывает событие в тему `llm-<providerId>`.
3. `llm-router` (`queue.ts` `startLlmRouter`) вызывает `AIControl.processEvent` (`controller.ts`), которая гейтит по лимитам (`checkTokensLimit`, `PoolLimits.isBlockedByLevel`) и передаёт событие в `WorkspaceClient.processMessageEvent` (`workspace/workspaceClient.ts`).
4. `processMessageEvent` собирает контекст ветки (`buildThreadContext`, `workspace/threadContext.ts`), создаёт документ `AIRequest` (`createAIRequest`, `workspaceClient.ts`), гоняет цикл "модель<->инструменты" (`runToolCalls`, `llms/toolLoop.ts`) и пишет ответ/предложение в чат, обновляя `AIRequest` (`updateAIRequest`) и биллинг токенов (`billUsage`, `billing.ts`).

**2. "Обсудить с ассистентом" (диалог, привязанный к объекту).**
1. Кнопка в шапке объекта (`DiscussWithAI.svelte`) -> `openOrStartObjectConversation` (`plugins/ai-bot-resources/src/conversation.ts`) находит/создаёт `AIContextMessage` (`findObjectConversation`) в Direct-чате с ботом.
2. Дальше работает та же серверная цепочка (сценарий 1), но `objectIdIsSpace=false` -> в контекст попадает вся ветка плюс промпт объекта (`buildDocPrompt`, `workspaceClient.ts`, `buildDocPromptText`, `workspace/docPrompt.ts`).
3. Бот не пишет объект сам: правка/задача идут тулами `propose_task`/`propose_subtasks` (`utils/tools.ts`) как `AIEditProposalMessage`/`AITaskProposalMessage`, рендерятся `EditProposalPresenter`/`TaskProposalPresenter` (`models/ai-bot/src/index.ts`) и применяются пользователем.

**3. Голосовая заметка в чате.**
1. Аудио-вложение создаёт `AudioTranscribe` -> `OnAudioTranscribe` (`server-plugins/ai-bot-resources/src/index.ts`) кладёт `ChatVoiceTranscriptionTask` (kind `chat-voice`) в `QueueTopic.TranscriptionQueue`.
2. Роль `stt-worker` (`queue.ts` `startSttWorker`) резолвит ASR-модель (`resolveAsrModel`, `transcription/asrRegistry.ts`), транскрибирует и опционально правит текст через LLM (`AIControl.correctTranscript`, `controller.ts`).
3. Результат пишется в `AudioTranscribe.text`/`state=done`, длительность биллится (`pushTranscriptDuration`, `billing.ts`).

**4. Встреча (love): захват аудио и транскрипция.**
1. LiveKit создаёт job для комнаты встречи -> `love-agent` (`services/ai-bot/love-agent/src/agent.ts`, `requestFunc`) запрашивает identity у pod-ai-bot (`GET /love/:roomName/identity`, `services/ai-bot/pod-ai-bot/src/server/server.ts`) и подключается как участник.
2. Подписывается на аудио-треки (`agent.ts` `RoomEvent.TrackSubscribed`), гонит потоковый ASR сам (`stream/stt.ts`) и шлёт финальный текст на `POST /love/transcript` (`stream/stt.ts` -> `server.ts`) -> `AIControl.processLoveTranscript` (`controller.ts`) пишет реплику в `MeetingMinutes`.
3. Параллельно архивирует сырые чанки и сессионную запись (`POST /love/send_raw`/`/love/send_session`, `stream/stt.ts`) -> `AIControl.processAudioChunk`/`processSessionRecording` (`controller.ts`). Комнаты/LiveKit/приглашения - вне этого документа, см. `office-meetings.md`.

**5. Автосводка встречи по завершении.**
1. Встреча заканчивается -> событие `QueueMeetingEvent.finished` в `QueueTopic.LoveQueue`, читает `startSttIngest` (`queue.ts`, case).
2. Вызывается `AIControl.autoSummarizeMeeting` (`controller.ts`), которая проверяет `shouldAutoSummarize` (смотрит `AISpaceSettings.meetingSummary`) и вызывает `summarizeMessages`.
3. Сводка идёт через отдельную Kafka-тему `ai-summary` (`SUMMARY_TOPIC`, `queue.ts`; консьюмер `startSummary`), чтобы длинная генерация не блокировала love-очередь.

**6. Лимиты и биллинг перед/после LLM-вызова.**
1. `AIControl.processEvent` (`controller.ts`) гейтит по `checkTokensLimit` (читает `LimitsState`, `limits.ts`, обновляется событиями `LimitsChanged`) и по глобальному пулу (`PoolLimits.isBlockedByLevel`, `billing.ts`) -> при исчерпании пула `ApiError(402, ...)` (`controller.ts`), без деградации на слабую модель.
2. Месячное окно лимита берётся из биллинга с кэшем 30с (`getWorkspaceWindows`, `billing.ts`, `decideLevel`, `workspace/windowLimit.ts`).
3. После ответа токены биллятся (`billUsage`/`tokensRecord`, `billing.ts`) в топик `BillingUsage`; купленные пакеты/топапы применяются `applyPurchase` по событию `PurchaseActivated` - подробности пулов см. `../memory/ai_token_topups.md`.

## Фичи

### AI-ассистент (диалог, встраивание в объекты)
- **"Обсудить с ассистентом" в шапке объекта.** Открывает привязанную к объекту ветку диалога. - `DiscussWithAI`, `plugins/ai-bot-resources/src/components/DiscussWithAI.svelte`; точка расширения `models/ai-bot/src/index.ts`.
- **Ассистент в диалоге создания задачи.** Тумблер в шапке + панель рядом с формой issue. - `IssueAssistToggle`/`IssueAssistPanel`, `models/ai-bot/src/index.ts`.
- **Issue-draft разговор.** Переиспользует незаполненные черновики. - `startIssueDraftConversation`, `plugins/ai-bot-resources/src/conversation.ts`.
- **"Новый контекст".** Архивация текущего диалога и старт нового. - `ThreadContextActions`, `archiveConversation`/`resetObjectConversation`, `conversation.ts`.
- **Предложение правки как diff.** Бот не пишет объект сам, только предлагает. - `TAIEditProposalMessage`+`EditProposalPresenter`, `models/ai-bot/src/index.ts`.
- **Предложение задачи с подзадачами.** Редактируемая карточка, создание только по подтверждению. - `TAITaskProposalMessage`+`TaskProposalPresenter`, тулы `propose_task`/`propose_subtasks`, `utils/tools.ts`.
- **Экспорт разговора в markdown.** Включая tool-calls. - GET `/conversation/:id/export`, `services/ai-bot/pod-ai-bot/src/server/server.ts`; `fetchConversationExport`, `plugins/ai-bot-resources/src/requests.ts`; `exportConversationMdx`, `exportChat.ts`.
- **Личная память пользователя.** `personalContext` + предпочитаемый язык, как Preference. - `AIPersonalData`, `resolveMemory`, `services/ai-bot/pod-ai-bot/src/workspace/memory.ts`.
- **Настройки AI уровня workspace/space.** level/asrLevel/language/sharedPrompt/meetingSummary. - `AISpaceSettings`, `AISpaceSettingsEditor.svelte`/`AISettings.svelte`/`AIPersonalDataSettings.svelte`.
- **Индикатор "печатает" + отмена запроса.** - `startTyping`/`isRequestCancelled`, `workspace/workspaceClient.ts`.
- **Приветствие новому активному сотруднику в Direct.** - `pickWelcome`/`loadWelcomeMessages`, `services/ai-bot/pod-ai-bot/src/welcome.ts`; подробности - `../memory/ai_bot_proactive.md`.

### AI-боты (серверные механизмы)
- **Роутинг упомянутых/direct сообщений.** - `OnMessageSend`, `server-plugins/ai-bot-resources/src/index.ts`.
- **Голосовые из чата в STT-очередь.** - `OnAudioTranscribe`, `server-plugins/ai-bot-resources/src/index.ts`.
- **Ручная сводка сообщения/встречи.** - `summarizeMessages`, `controller.ts`; POST `/summarize`, `services/ai-bot/pod-ai-bot/src/server/server.ts`.
- **Перевод с сохранением структуры.** - `translate`, `controller.ts`; POST `/translate`, `services/ai-bot/pod-ai-bot/src/server/server.ts`.
- **Компакция контекста.** Старые реплики сворачиваются в сводку вместо обрезки. - `planCompaction`/`renderForSummary`, `workspace/compaction.ts`.
- **Окно контекста ветки + промпт объекта.** С outline при переполнении. - `buildThreadContext`, `workspace/threadContext.ts`; `buildDocPromptText`, `workspace/docPrompt.ts`.
- **Цикл "модель<->инструменты" с лимитом итераций.** - `runToolCalls`, `MAX_TOOL_ITERATIONS=8`, `llms/toolLoop.ts`; бюджеты `toolBudgets`, `utils/budget.ts`.
- **`AIRequest` как документ жизненного цикла запроса.** Статус/итерация/токены на весь запрос. - `createAIRequest`/`updateAIRequest`, `workspace/workspaceClient.ts`.

### LLM/ASR-провайдеры и модели
- **OpenAI-провайдер.** chat.completions + tool-calls. - `OpenAIProvider`, `llms/openai.ts`.
- **Счётчик токенов tiktoken.** `countTokens` считает по готовому `Tiktoken`-энкодингу; сам энкодинг резолвит вызывающий провайдер через `encodingForModel` с fallback на `cl100k_base`. - `countTokens`, `plugins/openai/src/utils.ts`; резолв энкодинга - `llms/openai.ts`, `llms/gigachat.ts`.
- **GigaChat-провайдер.** - `createGigaChatProvider`, `llms/gigachat.ts`.
- **"Server"/clisr-провайдер.** LLM-запросы проксируются на подключённые клиенты-воркеры. - `createServerLLMProvider`, `llms/server.ts`; протокол - `../memory/clisr_wire_protocol.md`.
- **Mock-провайдер для тестов.** Детерминированный, offline. - `createMockProvider`, `llms/mock.ts`; включение - `../aibot-mock-testing.md`.
- **Реестр моделей уровень->провайдер.** Fallback-лестница по `order`, сужение по фиче. - `resolveModel`/`registryForFeature`/`availableLevels`, `llms/modelRegistry.ts`.
- **Мультипровайдерный yaml-реестр.** Уникальное владение уровня. - `buildProviderRegistry`/`assertUniqueLevelOwner`, `config.ts`.
- **Реестр ASR-провайдеров с fallback.** - `availableAsrLevels`/`resolveAsrModel`, `transcription/asrRegistry.ts`.

### Лимиты и биллинг
- **In-memory `LimitsState`.** fail-open до первого события `LimitsChanged`. - `limits.ts`.
- **Месячное окно биллинга.** Кэш 30с + stale-if-error. - `getWorkspaceWindows`, `billing.ts`; `decideLevel`, `workspace/windowLimit.ts`.
- **Гейт по лимиту токенов перед LLM.** - `checkTokensLimit`, `controller.ts`.
- **Глобальный пул-лимит на (provider, model).** fail-open, адаптивный поллинг. - `PoolLimits`, `billing.ts`.
- **Биллинг токенов.** `billedTokens = ceil((prompt+completion) * tokenMultiplier)`. - `billUsage`/`pushTokensData`, `billing.ts`.
- **Биллинг длительности транскрипции.** - `pushTranscriptDuration`, `billing.ts`.
- **Сверка биллинга Deepgram.** По страницам, group by workspace+day. - `updateDeepgramBilling`, `billing.ts`.
- **Покупка/пополнение токенов.** Два пула: тарифное окно + купленный баланс. - `applyPurchase`, `billing.ts`; модель пулов - `../memory/ai_token_topups.md`.
- **Публикация каталога моделей в биллинг + self-heal.** - `pushModelRegistry`, `billing.ts`.

## Куда смотреть, если нужно...

- Добавить новый LLM-провайдер -> `services/ai-bot/pod-ai-bot/src/llms/index.ts` (switch по `provider.kind`) + новый файл `llms/<name>.ts`, реализующий интерфейс `LLMProvider` (`llms/types.ts`).
- Добавить/изменить инструмент модели -> `registerTool`/`getTools`, `utils/tools.ts`.
- Поменять лимит/бюджет цикла инструментов -> `MAX_TOOL_ITERATIONS`, `llms/toolLoop.ts`; `toolBudgets`, `utils/budget.ts`.
- Изменить правила биллинга токенов -> `billUsage`/`tokensRecord`, `billing.ts`.
- Изменить лимиты по тарифу/пулу -> `limits.ts`, `workspace/windowLimit.ts`, `PoolLimits`, `billing.ts`.
- Добавить новый уровень модели/ASR -> yaml `CONFIG_PATH` (структура - `../aibot-deployment.md`), парсинг `config.ts`.
- Поменять UI настроек Юли -> `plugins/ai-bot-resources/src/components/AISettings.svelte`, `AISpaceSettingsEditor.svelte`.
- Изменить текст приветствия новому сотруднику -> `welcome.yaml` (данные) + `welcome.ts` (логика).
- Поменять логику компакции контекста разговора -> `planCompaction`, `workspace/compaction.ts`.
- Изменить контекст ветки (Direct-день vs весь тред) или промпт объекта -> `processMessageEvent`, `workspace/workspaceClient.ts`; `buildThreadContext`, `workspace/threadContext.ts`.
- Поменять поведение автосводки встречи -> `autoSummarizeMeeting`/`shouldAutoSummarize`, `controller.ts`.
- Поменять захват/realtime STT на встрече -> `services/ai-bot/love-agent/src/stream/stt.ts`, `agent.ts`.

## Настройки и конфигурация

Полный список переменных окружения и yaml-структура реестра моделей - `../aibot-deployment.md`. Основное:
- `CONFIG_PATH`/`CONFIG_YAML` - yaml-реестр моделей и ASR-провайдеров (`config.ts`).
- `MODE` - роль пода (`all`/`event-router`/`llm-router`/`stt-worker`/`client`/`queue`), дефолт `queue` (`config.ts`).
- `LLM_PROVIDER`, `OPENAI_*`, `GIGACHAT_*` - провайдер по умолчанию и его ключи/модели (`config.ts`).
- `AI_DEFAULT_LEVEL`, `AI_DEFAULT_LANGUAGE`, `MAX_CONTENT_TOKENS` - дефолты уровня/языка/окна контекста (`config.ts`).
- Рабочее пространство: `AISpaceSettings` (level/asrLevel/language/sharedPrompt/meetingSummary), доступна только `AccountRole.Owner` (`models/ai-bot/src/index.ts`).
- Пользователь: `AIPersonalData` (personalContext/language) в настройках аккаунта.

## Тесты

- Unit (Jest), pod-ai-bot - `services/ai-bot/pod-ai-bot/src/__tests__/*.spec.ts` (tool-loop, compaction, billing-tokens, limits, window-limit, model-registry, asr-registry, welcome, memory, thread-context, doc-prompt и др.), включая eval-harness `__tests__/eval/*` (сравнение качества моделей - `../ai-harness.md`).
- Unit (Jest), love-agent - `services/ai-bot/love-agent/src/__tests__/*.spec.ts` (stt-prebuffer, stt-cleanup, stt-memory-leak, chunk-detection, agent-shutdown).
- Unit, ai-bot-resources - `plugins/ai-bot-resources/src/__tests__/lang.test.ts`.
- Sanity (Playwright) - `tests/sanity/tests/chat/ai-bot.spec.ts`, `ai-bot-scenarios.spec.ts`, `ai-bot-llm.spec.ts`, `ai-bot-tools.spec.ts`; page/API-хелпер `tests/sanity/tests/API/AiBot.ts`.
- Локальная проверка UI-сценариев без реальной модели - мок-провайдер, `../aibot-mock-testing.md`.

## Связанные документы

- [`../aibot.md`](../aibot.md) - топология и тест-план для QA.
- [`../llm.md`](../llm.md) - устройство pod-ai-bot и сценарии обработки запросов.
- [`../ai-harness.md`](../ai-harness.md) - алгоритм harness, каталог инструментов, промпты.
- [`../aibot-deployment.md`](../aibot-deployment.md) - роли `MODE`, env, реестр провайдеров, масштабирование.
- [`../aibot-mock-testing.md`](../aibot-mock-testing.md) - мок-провайдер для локальной проверки без модели.
- [`office-meetings.md`](office-meetings.md) - виртуальный офис/LiveKit, куда подключается love-agent.
- [`../memory/ai_bot_context_and_settings.md`](../memory/ai_bot_context_and_settings.md) - контекст разговоров, баг с пустым тредом.
- [`../memory/ai_bot_proactive.md`](../memory/ai_bot_proactive.md) - welcome-сообщения, ленивое появление бота в пространстве.
- [`../memory/ai_harness_progress_cancel.md`](../memory/ai_harness_progress_cancel.md) - прогресс запроса и отмена, баг с `AIRequest`.
- [`../memory/ai_token_topups.md`](../memory/ai_token_topups.md) - модель двух пулов токенов.
- [`../memory/clisr_wire_protocol.md`](../memory/clisr_wire_protocol.md) - формат кадров clisr-протокола.
- [`../memory/love_agent_prebuffer.md`](../memory/love_agent_prebuffer.md) - pre-buffer нарезки аудио-чанков в love-agent.
