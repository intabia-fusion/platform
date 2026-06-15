# LLM: список задач

Архитектура: `docs/llm.md`. Порядок - сверху вниз; P0 - первая очередь.

## P0 - первая очередь

### T1. Usage из API провайдеров
- [x] `ChatCompletionResult`/`WithToolsResult`: `usage: number` -> `TokenUsage
      { promptTokens, completionTokens, approx? }` + хелпер `totalTokens()`
      (`src/llms/types.ts`).
- [x] `OpenAIProvider`: `toUsage()` из `usage.prompt_tokens/completion_tokens`
      везде (incl. `runTools` `totalUsage()`).
- [x] `GigaChatProvider`: `toUsage()` из `response.usage`.
- [x] `workspaceClient`: потребление через `totalTokens()`, fallback countTokens.
- [x] Тесты `llm-server-provider.spec.ts` обновлены (42 passing).
- [ ] clisr протокол: обязательное поле `usage` в `chat.response` от клиента
      (делается в T2 вместе с tool loop); сейчас clisr usage идёт как у openai/gigachat
      (клиент использует те же провайдеры).
- [ ] Approx-маркировка `approx: true` для clisr-ответов без usage (с T2).
- [ ] `billing.ts pushTokensData`: modelId/split-поля - ОТЛОЖЕНО (контракт billing
      не трогаем; сейчас шлём сумму как раньше). Отдельной задачей.
- [ ] Пре-флайт токенайзер GigaChat (`/tokens/count`) - отдельно, низкий приоритет.
- Файлы: `src/llms/{types,openai,gigachat,index}.ts`,
  `src/workspace/workspaceClient.ts`, `src/__tests__/llm-server-provider.spec.ts`.

### T2. Tool calls через clisr
- [x] Протокол: `ChatCompletionWithToolsRequest{toolDefinitions, priorToolResults}`
      -> `ChatCompletionWithToolsReply{completion|toolCalls, usage}` (server.ts).
- [x] Типы `ToolDefinition/ToolCall/ToolResult/ChatToolStepResult` в `llms/types.ts`.
- [x] Чистый orchestrator `llms/toolLoop.ts` (`runToolCalls`): инъекция ask/execute,
      max 8 итераций, суммирование usage. Полное покрытие `tool-loop.spec.ts`.
- [x] `ServerLLMProvider.createChatCompletionWithTools`: цикл через `runToolCalls`,
      инструменты выполняет под (замыкания из `getTools` несут WorkspaceClient).
- [x] `getToolDefinitions` в `utils/tools.ts` (client-side схемы).
- [x] `OpenAIProvider.chatToolStep`: один шаг с tool_calls без выполнения, replay
      priorToolResults как `role:'tool'`.
- [x] `client.ts`: ветка createChatCompletionWithTools -> `chatToolStep` (fallback
      на старый путь для провайдеров без него).
- [ ] GigaChat `chatToolStep` - нет function calling в текущем API, отдельно.
- [ ] e2e через реальный clisr - в стенде (юнит покрыт).

### T3. Память пользователя -> Preference
- [x] `AIPersonalData extends Preference` в `plugins/ai-bot` (interface + class ref)
      + модель `TAIPersonalData` в `models/ai-bot` (domain preference,
      `attachedTo: AccountUuid`).
- [x] ai-bot пишет память Preference от имени юзера: `RestClient.createDoc/update`
      с `modifiedBy = primary socialId` юзера (resolveUserSocialId). createdBy=user
      -> PrivateMiddleware пускает -> юзер видит в настройках.
- [x] `getHistory`/`saveHistory`: память <-> Preference, история <-> blob
      (расщеплены). Инструменты памяти идут через них -> на Preference.
- [x] Lazy-миграция: блоб `ai-bot-phr-*` -> Preference при первом чтении, если
      Preference ещё нет (чистая `resolveMemory`, покрыта `memory.spec.ts`).
- [x] history по-прежнему в блобе (переедет в AIConversation в T7).
- Файлы: `plugins/ai-bot/src/index.ts`, `models/ai-bot/src/index.ts`,
  `workspace/{workspaceClient,memory}.ts`.

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

### T15. Системные промпты в prompts.yaml
- [x] Все промпты вынесены в `services/ai-bot/pod-ai-bot/prompts.yaml`.
- [x] `promptStore.ts`: загрузка yaml + рендер шаблонов
      (`{{var}}`, условные `{{#var}}...{{/var}}`). БЕЗ fallback на дефолты -
      отсутствие файла/ключа/пустой yaml -> throw (fail fast).
- [x] Путь: `PROMPTS_PATH` env -> `cwd/prompts.yaml` (docker) -> package root (dev).
- [x] `prompts.ts`: `PROMPTS.*` рендерят из yaml (lazy cache), сигнатуры не менялись -
      провайдеры не тронуты. `reloadPrompts()` для hot-reload/тестов.
- [x] Dockerfile: `COPY prompts.yaml ./`.
- [x] Тесты `prompt-store.spec.ts` (13): рендер, условные блоки, throw на
      missing/empty/incomplete, override, реальный prompts.yaml.
- [x] e2e-provider проверяет рендер всех промптов на живой модели.

## P1 - вторая очередь

### T5. Уровни ЮляИИ + реестр моделей (конфиг)
ПЕРЕОСМЫСЛЕНО: реестр = `AIProviderConfig` (1 провайдер = N уровней, 1 клиент,
1 топик, общий concurrency/batch), НЕ `AIModelConfig` (1 модель = 1 уровень).
GigaChat/clisr держат один клиент и выбирают модель per-request от уровня.
- [x] `AIProviderConfig` в YAML/env конфиге (`config.ts`): id, provider
      (openai/gigachat/clisr), concurrency, batch, `levels: Partial<Record<AILevel,
      {model, tokenMultiplier, capabilities?, tokenizer?}>>`, endpoint?,
      endpointConfig?. `buildProviderRegistry` (legacy single-provider fallback).
- [x] `modelRegistry.ts`: чистые `resolveModel(level)->{provider,level,model}`
      (fallback вниз/вверх по уровням), `billedTokens(usage,mult)`, `gigachatTier`
      (Lite/base/Pro/Max -> level+множитель). Тесты `model-registry.spec.ts` (11).
- [x] Провайдеры openai/gigachat/server принимают `AIProviderConfig`, `modelFor
      (level)`, `level?` в chat-методах. server forwards `level` в clisr-payload
      (клиент выбирает модель по уровню). Интерфейс `LLMProvider` + `level?` опц.
- [x] `AILevelSetting` - документ в `models/ai-bot` (`TAILevelSetting`,
      `attachedTo?: Ref<Space>`). Резолв подключён к диспетчеру: `LevelResolver`
      (space-setting -> ws-default -> `DefaultLevel`), кэш per workspace,
      инвалидация через server-trigger -> AIQueue. Тесты `level-resolver.spec.ts`.
- [x] `billedTokens` -> биллинг: `tokensRecord(...)` применяет множитель +
      modelId в reason; провайдеры openai/gigachat шлют billed. Тесты
      `billing-tokens.spec.ts`.
- [x] Уровни data-driven (НЕ enum): `AILevel = string`, реестр несёт
      order/label/description; `availableLevels(registry)` для UI-пикера (sort by
      order). Новый уровень = запись в конфиге.
- [x] Реестр с двумя источниками заложен: глобальный конфиг сейчас; BYOK
      workspace-overrides - отдельный провайдер/топик `llm-byok` (T13).

### T6. Pipeline: AIRequest + per-provider топики
- [x] `AIRequest`/`AILevelSetting` документы + `DOMAIN_AI` (`plugins/ai-bot`
      типы, `models/ai-bot` классы `TAIRequest`/`TAILevelSetting`). AIRequest:
      status/level/modelId/kind/promptTokens/completionTokens/billedTokens/
      estimatedFinishAt. (СОЗДАНЫ; AIRequest пока не пишется - см. T6c.)
- [x] Диспетчер: `pipeline.ts` чистый `dispatch(level)->topic` + проводка в
      `queue.ts`: AIQueue consumer -> резолв уровня (`DefaultLevel`) -> producer
      в топик `llm-<providerId>`. Тесты `pipeline.spec.ts` (6).
- [x] Обработчик: per-provider `createBatchConsumer(batchSize=batch)` +
      `RateLimiter(concurrency)` + heartbeat. `createTopic('llm-<id>', 1)` на
      старте (1 партиция = 1 активный обработчик, без локов БД).
- [x] REST `/events` -> AIQueue (не менялось; диспетчер теперь разводит дальше).
- [x] Уровни ПЕРЕОСМЫСЛЕНЫ дважды и УПРОЩЕНЫ (T6d):
      - Каталог уровней/моделей ОДИНАКОВ для всех -> НЕ в БД. Отдаёт aibot API
        `GET /levels` -> `AILevelInfo[]` (из `availableLevels` реестра). UI дёргает
        для пикера. AIModelInfo-документ + sync УДАЛЕНЫ.
      - В БД только `AILevelSetting` = выбранный активный уровень (space -> ws).
      - Server-trigger `applyLevel`: `event.level = AILevelSetting.level` напрямую
        (без чтения каталога/clamp по order). Pod валидирует через `resolveModel`
        (fallback для неизвестного уровня уже есть).
      - Pod-side LevelResolver/кэш/инвалидация УДАЛЕНЫ; dispatcher читает
        `event.level`. Квоты подписок (ограничение доступных уровней) - T11.
- [x] `billedTokens` в биллинг (T6c-1) + AIRequest статус-документ:
      processing -> done(токены/billed/modelId)/failed в PersonSpace юзера от его
      имени. Тесты `ai-request.spec.ts`. estimatedFinishAt (ETA) - T8 (EMA).
      queued-фаза опущена (задержка постановки мала; статус начинается с
      processing).
- [ ] Ретраи/"dead letter" по образцу transcription consumer - отдельно.

### T7. Разговоры ЮляИИ как треды в Direct (ПЕРЕОСМЫСЛЕНО)
Решение: разговоры = chunter-треды в Direct-канале юзер<->бот, НЕ отдельная
сущность AIConversation. План: `~/.claude/plans/vast-chasing-lark.md`.
- [ ] Триггер `server-plugins/ai-bot-resources`: top-level direct -> адресовать
      сам userMessage (objectId=message._id, ChatMessage, collection='replies',
      messageClass=ThreadMessage) -> бот отвечает тредом под сообщением.
- [ ] Контекст LLM из сообщений треда (родитель + ThreadMessage по порядку);
      убрать блоб-историю `ai-bot-phr-*`. Память остаётся в Preference (T3).
- [ ] `threadContext.ts` - чистая сборка/усечение контекста по MaxContentTokens
      (перенос `toLlmHistory`), unit-тест.
- [ ] Убрать clear_history / get_history_summary tools из direct.
- [ ] Переиспользуемый `startAIConversation` (client resource + server helper)
      над `createAndGetDirect` (`plugins/chunter/src/utils.ts:37`) +
      `openThreadInSidebar`; принимает текст + origin (objectId/class/label,
      reference-mention для возврата). Разговоры стартуются из разных мест.
- Fulltext/панель тредов/счётчик replies - бесплатно из chunter.

### T16. Structured-output tools (markdown -> markdown + diff + apply)
Поверх T7. Ассистент структурной правки полей.
- [ ] Tool(ы): принять markdown (напр. условие задачи), вернуть исправленный
      markdown (structured output провайдера).
- [ ] UI: показать diff (исходный <-> предложенный), кнопка применить.
- [ ] Apply: результат -> поле создаваемого/существующего объекта
      (задача/документ), переиспользуемый паттерн по типу поля.
- [ ] Интеграция со startAIConversation: правка обсуждается тредом, diff/apply
      в UI разговора.

## P2 - третья очередь

### T8. Прогноз времени ответа + индикация
- [ ] `AIRequest.kind='text-op'` с приоритетом выше chat.
- [ ] EMA-метрики обработчика (avgLatency на 1k токенов, avgQueueWait) ->
      статус-документ модели.
- [ ] `estimatedFinishAt` при постановке + уточнение при processing; UI - liveQuery.
- [ ] "ЮляИИ печатает" в чате через pulse `TypingIndicator`
      (`plugins/presence-resources/src/typing.ts`): создать при processing,
      снять по done/failed; передавать прогноз (расширить status/поле ETA).

### T9. Роли пода (один бинарь, MODE)
ПЕРЕОСМЫСЛЕНО: вместо `ROUTER_KIND` - роли через `MODE`. Очередь = развязка,
неважно кто где. Один под, несколько ролей:
- [x] `MODE=event-router`: читает ai-queue, резолвит модель (по `event.level`),
      перекладывает в `llm-<id>`. Чистый Kafka->Kafka. (`startEventRouterMode`)
- [x] `MODE=llm-router`: читает `llm-<id>` для `LLM_PROVIDER_IDS` (csv, пусто=все),
      поднимает провайдеры из реестра, batch+RateLimiter per provider. Для clisr -
      ClisrServer (handshake `llm`), обработчики подключаются. (`startLlmRouterMode`)
- [x] STT РАЗДЕЛЕН (T9-4): `stt-ingest` (HTTP audio + placeholder + producer +
      love-lifecycle) работает у ВСЕХ ролей по умолчанию (stateless, love шлёт на
      любой под; фикс бага потерянных тасков). `stt-worker` = consumer
      TranscriptionQueue + ClisrServer (handshake `transcription`, транскрибаторы
      подключаются) - масштаб consumer-group. (`startSttIngest`/`startSttWorker`)
- [x] `MODE=all` (=`queue` legacy) = все роли. `MODE=client` = clisr-обработчик.
      `bootstrap()` общий, `finalize()` shutdown. ingest вездесущий.
- [x] Маршрутизация по capability + round-robin уже в clisr `requestWithFilter`
      (`selectLLMClient` / `s.options.transcription`) - переиспользуется.
- [ ] Транскрибаторы как отдельный clisr-клиент (сейчас через `MODE=client`) -
      оформить отдельным деплоем. Hosted Intabia LLM-обработчики - отдельно.

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
