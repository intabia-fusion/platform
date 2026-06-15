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

### T9. aibot-router + параллельно с остальными провайдерами
- [ ] Выделить aibot-router (`Mode=router`): clisr-сервер с типом
      `ROUTER_KIND = all|llm|asr` (один router на всё, либо отдельные llm/asr);
      обработчики подключаются, объявляют capability в handshake (`llm`/`transcription`),
      router принимает только подходящие.
- [ ] Адресация пода: LLM - `AIModelConfig.endpoint`, STT - `STT_ROUTER_URL`
      (или общий `all`-router).
- [ ] ai-bot поды - клиенты router-а; LLM: `provider:'clisr'` в реестре, STT:
      `STT_PROVIDER=server` -> тот же router; маршрутизация filter по capability
      + round-robin (`requestWithFilter`, уже есть `selectLLMClient` /
      `s.options.transcription`).
- [ ] Транскрибаторы подключаются к router как clisr-клиенты с
      `transcription: true` (вынести из текущего client mode в router-топологию).
- [ ] Hosted Intabia = LLM-обработчики под фиксированным именем, уровень low.

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
