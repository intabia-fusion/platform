# LLM: список задач

Архитектура: `docs/llm.md`. Порядок - сверху вниз; P0 - первая очередь.

## P0 - первая очередь

### T1. Usage из API провайдеров
- [ ] `OpenAIProvider`: брать `usage.prompt_tokens/completion_tokens` из ответа везде
      (включая `runTools` цикл - суммировать по итерациям).
- [ ] `GigaChatProvider`: читать `usage` из ответа API.
- [ ] clisr протокол: обязательное поле `usage` в `chat.response` от клиента;
      `ServerLLMProvider` пробрасывает его наверх.
- [ ] Approx (tiktoken / chars/4) - только fallback, помечать `approx: true`.
- [ ] `ChatCompletionResult`: заменить `usage: number` на
      `{ promptTokens, completionTokens, approx }`.
- [ ] `billing.ts pushTokensData`: добавить `modelId`, `promptTokens`,
      `completionTokens`, `approx` (+ согласовать с billing-сервисом).
- [ ] Пре-флайт токенайзер по провайдеру: GigaChat - `/tokens/count` или калибровка;
      убрать `chars/4` из усечения контекста.
- Файлы: `src/llms/{types,openai,gigachat,server}.ts`, `src/billing.ts`,
  `src/workspace/workspaceClient.ts`.

### T2. Tool calls через clisr
- [ ] Протокол: многоходовой цикл `chat.request {toolDefs}` -> `{tool_calls}` ->
      `chat.toolResults` -> `{content, usage}` (max N итераций).
- [ ] Инструменты выполняет под (реестр `src/utils/tools.ts`), clisr-клиент - только модель.
- [ ] `ServerLLMProvider.createChatCompletionWithTools`: реализовать цикл.
- [ ] `src/client.ts` (client mode): обработка toolDefs/toolResults, возврат usage.
- [ ] Тесты: расширить `llm-server-provider.spec.ts`, `queue-client-modes.spec.ts`.

### T3. Память пользователя -> Preference
- [ ] `models/ai-bot`: `AIPersonalData extends Preference`
      (assistantMemory/userMemory/sharedContext), `attachedTo: AccountUuid`.
- [ ] ai-bot: чтение/запись через `TxOperations` от имени пользователя
      (паттерн pod-github `platform.ts:536`).
- [ ] Инструменты `update/get/clear_*_memory` переключить на Preference.
- [ ] Миграция из блоба `ai-bot-phr-*` (lazy: при первом обращении).
- [ ] Убрать write-back `historyMap` для памяти.

### T4. Секция Settings "ЮляИИ"
- [ ] `models/ai-assistant`: `setting.class.SettingsCategory`, group `settings-account`.
- [ ] Компонент в `plugins/ai-assistant-resources`: просмотр/редактирование/очистка
      assistantMemory / userMemory / sharedContext (liveQuery на AIPersonalData).
- [ ] Паттерн: TranslationSettings (`models/contact/src/index.ts:1413`).

### T14. Санитизация markdown -> Markup
- [ ] Общая schema-aware утилита в `@hcengineering/text-markdown`: чистка
      неизвестных узлов/marks + mark-exclusion через PM `Mark.addToSet`
      (баг: `RangeError: Invalid collection of marks ... bold,code`).
- [ ] Применить в ai-bot (`workspaceClient.ts:576`, `utils/tools.ts:94`) -
      все конверсии "ответ модели -> Markup".
- [ ] Применить в smartPaste редактора (`cleanUnknownContent`).
- [ ] Детали: `foundation-tasks/markdown-paste-marks-exclusion.md`.

## P1 - вторая очередь

### T5. Уровни ЮляИИ + реестр моделей (конфиг)
- [ ] `AIModelConfig` в YAML/env конфиге пода: provider, model, level
      (low/middle/high/max), tokenMultiplier, concurrency, batch, capabilities,
      tokenizer, endpointConfig.
- [ ] Маппинг GigaChat Lite/Pro/Max -> уровни + множители; clisr (локальное
      оборудование) -> low, минимальный множитель.
- [ ] `AILevelSetting` - документ в `models/ai-bot` (НЕ mixin на Space):
      `attachedTo?: Ref<Space>`; резолв: space -> workspace -> подписка.
- [ ] `billedTokens = (prompt+completion) * tokenMultiplier` -> биллинг.
- [ ] Реестр проектировать с двумя источниками: глобальный конфиг + (будущее)
      workspace-overrides для BYOK.

### T6. Pipeline: AIRequest + per-model топики
- [ ] `AIRequest` документ (status, level, modelId, payload, токены,
      estimatedFinishAt) - DOMAIN_AI, space = `contact.class.PersonSpace`
      пользователя (видит пользователь и система).
- [ ] Диспетчер: входной топик ai-queue -> резолв уровня/модели/квоты ->
      топик `llm-<modelId>`.
- [ ] Обработчик модели: `createBatchConsumer(batchSize=batch)` +
      `RateLimiter(concurrency)`; число партиций топика = число независимых
      обработчиков (GigaChat = 1 партиция -> ровно один активный под, без локов БД).
- [ ] REST `/events` -> публикация во входной топик.
- [ ] Ретраи/“dead letter” по образцу transcription consumer.

### T7. AIConversation (контексты разговоров)
- [ ] `AIConversation` (DOMAIN_AI, space = PersonSpace пользователя): title,
      summary, origin, active, totalTokens; активный контекст по (createdBy,
      origin), команда "начать заново".
- [ ] `AIConversationMessage extends AttachedDoc` - отдельные записи, формат
      совместим с chunter ChatMessage (оценить наследование) - переиспользование
      chat-механик и интеграция в чат.
- [ ] Fulltext индексация сообщений + title/summary - поиск по разговорам.
- [ ] Ролловер по лимиту токенов: summary (дешевым уровнем) + перенос хвоста
      в новую conversation.
- [ ] Замена `history` массива: хвост активной conversation -> LLM
      (усечение по maxContextTokens как `toLlmHistory`).
- [ ] Миграция истории из блоба в conversation (вместе с T3).
- [ ] UI: список разговоров + read-only просмотр (в секции из T4).

## P2 - третья очередь

### T8. Прогноз времени ответа + индикация
- [ ] `AIRequest.kind='text-op'` с приоритетом выше chat.
- [ ] EMA-метрики обработчика (avgLatency на 1k токенов, avgQueueWait) ->
      статус-документ модели.
- [ ] `estimatedFinishAt` при постановке + уточнение при processing; UI - liveQuery.
- [ ] "ЮляИИ печатает" в чате через pulse `TypingIndicator`
      (`plugins/presence-resources/src/typing.ts`): создать при processing,
      снять по done/failed; передавать прогноз (расширить status/поле ETA).

### T9. clisr router + параллельно с остальными провайдерами
- [ ] Выделить clisr router: один экземпляр с clisr-протоколом; обработчики
      запросов (clisr-клиенты) подключаются к нему, регистрируют модели в handshake.
- [ ] ai-bot поды - клиенты router-а; `provider:'clisr'` в реестре, маршрутизация
      filter + round-robin (`requestWithFilter`).
- [ ] Hosted Intabia = обработчики под фиксированным именем, уровень low.

### T10. Масштабирование gateway
- [ ] Вынести остатки in-memory state; N реплик gateway (consumer group).
- [ ] Решить деплой обработчиков: один бинарь со всеми `llm-*` топиками (старт)
      vs helm Deployment per провайдер с параметрами (например, только GigaChat,
      replicas=1).

### T11. Подписки (зависимость от billing)
- [ ] Уровень подписки ограничивает доступные уровни ЮляИИ (`high` - старшие тарифы)
      и квоту токенов (`Subscription.limits`).
- [ ] Проверка при постановке в очередь: отказ или даунгрейд уровня.

### T12. Streaming (после T6)
- [ ] Streaming для text-op у умеющих провайдеров; прогноз - до первого токена.

### T13. BYOK per workspace (после T5/T11)
- [ ] Отдельный провайдер + отдельный уровень `byok`, отдельные модели
      (не overrides глобального реестра).
- [ ] Ключи через account-интеграции: `Integration` (kind `ai-byok`, workspaceUuid)
      + `IntegrationSecret` (key = modelId, secret = ключ/конфиг провайдера).
- [ ] Добавить `aibot` в `integrationServices`
      (`server/account/src/utils.ts:1990`) для чтения секретов.
- [ ] Отдельный топик `llm-byok` (партиция по workspaceUuid), возможно отдельный
      пул обработчиков; ключи строго одного workspace на запрос.
- [ ] UI настройки в workspace settings (role Owner) - паттерн IntegrationType
      как у ai-assistant.
