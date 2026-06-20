//
// Copyright © 2026 Intabia Fusion
//

# AI Bot (ЮляИИ) — реализованные сценарии

Документ перечисляет то, что **уже работает в коде** (не план). Для каждого
сценария: что делает пользователь, точка входа, поток вызовов и покрытие тестами.
Планируемое/отложенное — в `docs/llm-tasks.md` (раздел «Реальный остаток»),
архитектура и история решений — в `docs/llm.md`, развёртывание ролей — в
`docs/llm-deploy.md`.

## Обзор потока

```
Клиент/триггеры -> Kafka (AIQueue/Transcription) -> pod-ai-bot (роль MODE)
  event-router  : строит AIEventRequest, кладёт в провайдерный топик llm-<id>
  llm-router    : per-provider consumer -> processEvent -> LLM -> ответ в чат
  stt-ingest    : HTTP audio (love) -> placeholder + producer Transcription
  stt-worker    : Transcription consumer -> STT -> текст в minutes
  all           : всё в одном бинаре (dev/малые стенды)
```

## 1. Чат с ЮляИИ в Direct-канале

- **Делает**: пишет top-level сообщение в личный Direct-канал с ботом -> бот
  отвечает **тредом** под этим сообщением; ответы в треде = продолжение
  разговора. Каждое top-level сообщение = отдельная тема (T7).
- **Вход**: `server-plugins/ai-bot-resources/src/index.ts` `OnMessageSend` ->
  direct-ветка -> `onBotDirectMessageSend` -> producer `AIQueue`.
- **Поток**: триггер строит `AIEventRequest` (адресует сам ChatMessage юзера,
  `messageClass=ThreadMessage`) -> `applyLevel` подставляет уровень из
  `AISpaceSettings` -> `queue.ts` consumer -> `controller.processEvent` ->
  `workspaceClient.processMessageEvent`. Контекст LLM = открывающее сообщение +
  сообщения треда (чистая сборка в `workspace/threadContext.ts`).
- **Тесты**: `__tests__/queue-client-modes.spec.ts` (роутинг событий),
  `__tests__/thread-context.spec.ts` (усечение/порядок/роли контекста треда).

## 2. @mention ЮляИИ в каналах/тредах

- **Делает**: упоминает бота `@ЮляИИ` в любом канале/треде -> бот отвечает в том
  же месте.
- **Вход**: `server-plugins/ai-bot-resources/src/index.ts` — обход markup,
  детект mention по `node.attrs.id` -> `onBotDirectMessageSend` с
  `kind='mentioned'`.
- **Поток**: тот же, что у чата, ветка `messageClass` по типу родителя; контекст
  = сообщения треда/канала.
- **Тесты**: `__tests__/queue-client-modes.spec.ts`.

## 3. Память пользователя (assistantMemory / userMemory / sharedContext)

- **Делает**: бот помнит факты о пользователе между разговорами; пользователь
  правит через настройки. Хранение — Preference (T3), не блоб.
- **Вход**: tools в `utils/tools.ts` (update/get/clear на каждый тип памяти);
  миграция/резолв в `workspace/memory.ts` `resolveMemory`. UI настроек —
  `plugins/ai-bot-resources`.
- **Поток**: LLM в tool-loop вызывает memory-tool -> чтение/запись Preference.
- **Тесты**: `__tests__/memory.spec.ts`.

## 4. Транскрибация встреч (love)

- **Делает**: говорит на встрече -> в minutes появляется placeholder, затем
  текст реплики.
- **Вход**: `server/server.ts` love-эндпоинты (audio chunks) ->
  `controller.processAudioChunk`.
- **Поток**: `stt-ingest` принимает audio на любом поде -> сохраняет чанк +
  placeholder-сообщение -> producer `Transcription`; `stt-worker` consumer ->
  STT -> текст в minutes. (Ingest вездесущ — HTTP на любую роль; worker
  масштабируется отдельно.)
- **Тесты**: `__tests__/components.spec.ts` (чанк/плейсхолдер/метаданные).

## 5. Саммари встречи

- **Делает**: получает резюме переписки/встречи.
- **Вход**: `server/server.ts` `/summarize` -> `controller.summarizeMessages`.
- **Поток**: выборка сообщений из chunter -> резолв имён участников ->
  `llm.summarizeMessages` -> запись в коллаборативный документ.
- **Тесты**: NONE (только интеграционно). Покрыто косвенно e2e-провайдером.

## 6. Перевод (translateHtml)

- **Делает**: перевод HTML/markup-фрагмента.
- **Вход**: `server/server.ts` `/translate` -> `controller.translate`.
- **Поток**: markup -> JSON -> HTML -> `llm.translateHtml` -> обратно в markup.
- **Тесты**: NONE (только интеграционно).

## 7. Выбор уровня ЮляИИ (AILevel)

- **Делает**: уровень = свойство запроса; пространство задаёт потолок
  (`AISpaceSettings`). Каталог уровней клиент берёт из API.
- **Вход**: `server/server.ts` `GET /levels` -> `availableLevels(AIProviders)`
  (отсортированы по order, дедуп). Модель `AISpaceSettings` (`models/ai-bot`).
  Триггер `applyLevel` подставляет уровень в событие.
- **Статус**: API + модель + триггер готовы. Полноценного UI-селектора пока нет
  (задел для клиента).
- **Тесты**: `__tests__/model-registry.spec.ts` (`availableLevels`,
  `resolveModel`, fallback по order).

## 8. Инструменты модели (tool calling)

- **Делает**: модель в tool-loop вызывает зарегистрированные инструменты.
- **Вход**: `utils/tools.ts` `registerTool` -> `getTools` фильтрует по
  контексту (direct/thread).
- **Состав** (по `utils/tools.ts`): memory-tools (update/get/clear для
  assistant/user/shared), плюс контекстные инструменты разговора. `clear_history`
  / `get_history_summary` убраны (T7 — тред сам по себе история).
- **Тесты**: `__tests__/e2e-tools.spec.ts` (реальный tool calling против
  ollama, скип без `AI_BOT_E2E=1`).

## 9. Провайдеры и роутинг по уровню

- **Делает** (админ/деплой): один провайдер обслуживает N уровней, держит 1
  клиент и 1 топик `llm-<id>`. Дефолт — legacy openai/gigachat/clisr из yaml/env.
- **Вход**: `config.ts` `buildProviderRegistry` (синтез legacy-конфига в
  `AIProviderConfig[]`); `llms/index.ts` `createProvider`/
  `createProvidersFromRegistry`/`createDefaultProvider`.
- **Поток**: `resolveModel(level, registry)` -> провайдер+модель+множитель;
  `dispatch` -> топик `llm-<id>`; gigachat-tier mapping в `modelRegistry.ts`.
- **Тесты**: `__tests__/model-registry.spec.ts`,
  `__tests__/llm-server-provider.spec.ts`, `__tests__/e2e-clisr-router.spec.ts`
  (router+client loop), `__tests__/e2e-provider.spec.ts`.

## 10. AIRequest — статус-документ запроса

- **Делает**: видимый объект жизненного цикла запроса (queued -> done/failed) c
  токенами и ошибкой; основа биллинга и ETA.
- **Вход**: `workspace/aiRequest.ts` `queuedRequest`/`donePatch`/`failedPatch`;
  пишется в `processMessageEvent` вокруг chat. Домен `DOMAIN_AI`.
- **Поток**: queued (level, modelId, kind) -> done (prompt/completion/billed
  токены, `billed = ceil((prompt+completion)*multiplier)`) либо failed (error).
- **Тесты**: `__tests__/ai-request.spec.ts`.

## 11. Биллинг токенов

- **Делает**: списывает токены с учётом множителя уровня.
- **Вход**: `billing.ts` `tokensRecord` (billed + modelId в reason).
- **Поток**: usage из LLM -> `billedTokens(usage, multiplier)` -> запись в
  billing.
- **Тесты**: `__tests__/billing-tokens.spec.ts`,
  `__tests__/usage.spec.ts`, `__tests__/model-registry.spec.ts`
  (`billedTokens`).

## 12. Запись сессии встречи (love/send_session)

- **Делает**: стримит запись встречи (OGG Opus) в хранилище, привязывает к
  minutes.
- **Вход**: `server/server.ts` love-эндпоинт -> `controller.processSessionRecording`.
- **Поток**: стрим в storage -> метаданные на minutes.
- **Тесты**: `__tests__/components.spec.ts` (валидация метаданных).

## E2e против локального LLM (ollama)

E2e-тесты (`e2e-tools`, `e2e-clisr-router`, `e2e-provider`) гоняются против
малой модели в ollama; по умолчанию скипаются (нужен `AI_BOT_E2E=1`). Малая
модель запекается в образ `intabiafusion/ollama-base` для offline/CI — см.
`dev/ollama/README.md`. Запуск:

```bash
cd services/ai-bot/pod-ai-bot
AI_BOT_E2E=1 AI_BOT_E2E_URL=http://127.0.0.1:11434/v1 AI_BOT_E2E_KEY=ollama \
  AI_BOT_E2E_MODEL=qwen2.5:0.5b-instruct-q8_0 npx jest e2e
```
