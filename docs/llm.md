# Работа с LLM в платформе (ai-bot)

Документ описывает текущее устройство обработки LLM-запросов в `services/ai-bot/pod-ai-bot`
и целевую архитектуру: учет токенов, tool calls через clisr, персональные данные в Preference,
уровни ЮляИИ, масштабируемый pipeline обработки и прогноз времени ответа.
Список задач: `docs/llm-tasks.md`.

## 1. Текущее состояние

### 1.1 Точки входа

| Вход | Где | Что |
|---|---|---|
| Kafka `QueueTopic.AIQueue` (10 партиций) | `src/queue.ts` | `AIEventRequest` от платформы (сообщения пользователя ai-боту) |
| REST `POST /events` | `src/server/server.ts` | тот же `AIEventRequest` напрямую |
| Kafka `QueueTopic.LoveQueue` | `src/queue.ts` | start/finish митингов (транскрипция) |
| Kafka `QueueTopic.TranscriptionQueue` | `src/transcription/consumer.ts` | аудио-чанки для STT |
| REST `/translate`, `/summarize`, `/connect`, ... | `src/server/server.ts` | вспомогательные операции |

Цепочка обработки сообщения:

```
Kafka/REST -> AIControl.processEvent (controller.ts)
  -> WorkspaceClient.processMessageEvent (workspace/workspaceClient.ts)
       -> resolve personUuid, prompt, история, system prompts
       -> getTools(...) -> llm.createChatCompletionWithTools(...)
       -> pushHistory(user/assistant) -> addCollection(ChatMessage)
```

Обработка синхронная: событие из Kafka обрабатывается "в момент чтения", статус запроса
нигде не персистится, очереди запросов как сущности нет.

### 1.2 Провайдеры (`src/llms/`)

Все реализуют `LLMProvider` (`src/llms/types.ts`):

| Провайдер | Файл | Streaming | Tool calls | countTokens |
|---|---|---|---|---|
| `OpenAIProvider` | `openai.ts` | нет (`stream: false`) | да, `beta.chat.completions.runTools()` | tiktoken по модели, fallback `cl100k_base` |
| `GigaChatProvider` | `gigachat.ts` | нет | нет (tools принимаются, но в API не передаются) | tiktoken `gpt-4` (приближение) |
| `ServerLLMProvider` (clisr) | `server.ts` | нет | только схемы (`toolDefinitions`), функции не выполняются | `chars / 4` (грубая оценка) |

Выбор провайдера - глобальный для всего пода: `LLM_PROVIDER` env / YAML `llm.provider`
(`src/llms/index.ts:72-125`). Один под = один провайдер = одна модель на все workspace.

### 1.3 Учет токенов - проблемы

- `promptTokens` / `responseTokens` считаются клиентским tiktoken, а не берутся из
  `usage` ответа API (у OpenAI `usage` используется частично, у GigaChat и clisr - нет).
- GigaChat имеет собственный токенизатор (и API `/tokens/count`), tiktoken `gpt-4` дает
  систематическую ошибку.
- clisr: `chars / 4` - непригодно ни для биллинга, ни для усечения контекста.
- В биллинг (`billing.ts: pushTokensData`) уходит одно число `tokens` без разбивки
  prompt/completion и без указания модели/провайдера.

### 1.4 Tool calls - проблемы

Инструменты определены в `src/utils/tools.ts` (память ассистента, история, импорт документов,
saveFile через DataLab). Реальный цикл tool calling работает только у OpenAI.
В режиме clisr (`Mode=client`, `src/client.ts`) на удаленную сторону передаются только JSON-схемы
инструментов; функции не сериализуются, поэтому tool calls не выполняются вовсе.

### 1.5 Персональные данные - текущее хранение

`PersonHistoryRecord` (`workspaceClient.ts`): `assistantMemory`, `userMemory`, `sharedContext`,
`history: HistoryRecord[]`. Хранится JSON-блобом в blob storage workspace
(ключ `ai-bot-phr-<personUuid>`), кешируется в `historyMap` в памяти пода.
Проблемы: нет видимости/редактирования пользователем, last-write-wins при нескольких репликах,
память и история склеены в один блоб, нет разделения контекстов разговоров.

### 1.6 Масштабирование - текущие ограничения

- Kafka consumer group `ai-queue-ai-bot` (10 партиций) формально позволяет несколько реплик,
  но: `historyMap` per-replica (гонки last-write-wins), `AIControl.workspaces` -
  in-memory `Map`, REST-эндпоинты (`/translate`, `/connect`, love) бьют в конкретный под.
- `RateLimiter(1)` в `WorkspaceClient` объявлен, но не используется (мертвый код).
- Ограничение параллелизма провайдера (GigaChat: 1-N одновременных запросов на токен)
  никак не учитывается - полагаемся на 429 + retry.
- `LLMProcessingBatch` в конфиге читается, но не используется.
- БД за pg-bouncer (transaction pooling) - советующие session-level механизмы
  (advisory locks, `SELECT ... FOR UPDATE` между транзакциями) использовать НЕЛЬЗЯ.
  Координация реплик - только через Kafka.

## 2. Целевая архитектура

### 2.1 Уровни ЮляИИ и реестр моделей

Пользователи/пространства НЕ выбирают конкретную модель. Вводится уровень ЮляИИ:
`low | middle | high`. Конкретные модели за уровнями настраиваются администратором
(конфиг сервиса, yaml формат), не в workspace:

```ts
interface AIModelConfig {
  id: string                       // 'gigachat-lite', 'gigachat-max', 'intabia-local'
  provider: 'openai' | 'gigachat' | 'clisr'
  model: string                    // id модели у провайдера
  level: 'low' | 'middle' | 'high' | 'max' // и тд
  tokenMultiplier: number          // множитель при списании токенов с квоты
  concurrency: number              // max параллельных запросов к провайдеру
  batch: number                    // сколько обработчик берет за раз
  capabilities: { tools: boolean, streaming: boolean, maxContextTokens: number }
  tokenizer: 'tiktoken' | 'gigachat' | 'approx'   // только для пре-флайта
  endpoint?: string                // baseURL / clisr filter
  endpointConfig?: Record<string, any> // дополнительные параметры для провайдера.
}
```

- GigaChat дает линейку моделей по уровням (Lite/Pro/Max) - маппинг уровень -> модель, + множители.
- clisr (локальное оборудование Intabia) - уровень `low`: самый дешевый и медленный,
  минимальный `tokenMultiplier`.
- Уровень выше -> `tokenMultiplier` больше -> токены списываются с квоты с коэффициентом.
- Хранение реестра: этап 1 - YAML/env конфиг пода (расширение текущего `config.ts`);
  этап 2 - админка (документы в account/admin-области), конфиг остается fallback.
- **BYOK (будущее)**: отдельный провайдер и отдельный уровень `byok`, отдельные
  модели (не overrides глобальных). Ключи per workspace - через существующий механизм
  интеграций account-сервиса: `Integration` (kind `ai-byok`, `workspaceUuid`) +
  `IntegrationSecret` (key = modelId, secret = ключ/конфиг провайдера;
  `server/account/src/types.ts:182`). Доступ к секретам - только сервисам из
  allowlist `integrationServices` (`server/account/src/utils.ts:1990`) - добавить
  туда `aibot`. Обработка - отдельный топик `llm-byok` (партиция по workspaceUuid)
  и, возможно, отдельный пул обработчиков; обработчик резолвит ключи конкретного
  workspace, запросы разных workspace не смешиваются.
- **Подписки (будущее)**: уровень подписки workspace ограничивает доступные уровни
  ЮляИИ (`high` только для старших тарифов) и квоты токенов. Источник лимитов -
  `Subscription.limits` в account db (см. billing). Проверка - при постановке запроса
  в очередь: недоступный уровень -> отказ/даунгрейд до доступного.

Уровень - настройка в модели данных (документ в `models/ai-bot`), НЕ mixin/наследник Space:

```ts
// models/ai-bot
interface AILevelSetting extends Doc {
  aiLevel: 'low' | 'middle' | 'high' | 'max'
  attachedTo?: Ref<Space>   // не задано - default для workspace
}
```

Резолв уровня запроса: настройка для space -> настройка workspace -> ограничение подписки.

### 2.2 Pipeline обработки запросов

Два этапа: входной канал -> диспетчер -> per-model топики -> обработчики моделей.

```
UI / триггер / chunter-сообщение
  -> AIRequest(status=pending) в БД + событие во входной топик (ai-queue)
  -> Диспетчер: резолвит уровень (space -> workspace -> подписка) -> AIModelConfig,
     проверяет квоту, считает прогноз, перекладывает в топик `llm-<modelId>`
  -> Обработчик модели: знает свой batch/concurrency, status=processing,
     вызов провайдера, usage из ответа
  -> status=done + result + promptTokens/completionTokens; для chat - пишет ChatMessage
     (markdown ответа -> Markup строго через schema-aware санитизацию, см. 2.10)
  -> UI следит за AIRequest через liveQuery
```

`AIRequest` хранится в `PersonSpace` пользователя (`contact.class.PersonSpace`,
`models/contact/src/index.ts:283`): видит сам пользователь и система, другие - нет.

```ts
interface AIRequest extends Doc {   // space = PersonSpace пользователя
  kind: 'chat' | 'translate' | 'summarize' | 'text-op' | ...
  level: 'low' | 'middle' | 'high'
  modelId: string                  // выбран диспетчером
  status: 'pending' | 'processing' | 'done' | 'failed' | 'cancelled'
  conversation?: Ref<AIConversation>
  payload: ...
  result?: ...
  promptTokens?: number            // из usage ответа
  completionTokens?: number        // из usage ответа
  billedTokens?: number            // (prompt+completion) * tokenMultiplier
  startedAt?: Timestamp
  finishedAt?: Timestamp
  estimatedFinishAt?: Timestamp    // прогноз для UI
  error?: string
}
```

Преимущества: запросы переживают рестарт пода, очередь/статус/ретраи персистентны,
разные провайдеры с разным параллелизмом не мешают друг другу, биллинг из фактического usage.

### 2.3 Один обработчик на модель при нескольких подах (GigaChat)

Проблема: GigaChat допускает только N параллельных запросов; подов несколько; нужно,
чтобы модель обрабатывал ровно один обработчик по N штук за раз. Без локов в БД
(pg-bouncer) решение - владение партициями Kafka:

- Топик `llm-gigachat` создается с **1 партицией**.
- Все поды подписываются на него в одной consumer group (`llm-gigachat-worker`).
- Kafka назначает партицию ровно ОДНОМУ консьюмеру группы - остальные поды стоят
  в горячем резерве. Под умер/завис -> rebalance, партиция переезжает на другой под
  автоматически. Это и есть распределенный "лок" без БД.
- Внутри пода-владельца: `createBatchConsumer` с `batchSize = N` (из `AIModelConfig.batch`),
  внутри батча - `RateLimiter(concurrency)`; offset коммитится после завершения батча.
- Модель допускает M параллельных обработчиков -> топик с M партициями: Kafka раздаст
  партиции максимум M подам, каждый со своим batch.
- clisr-модели: параллелизм определяется числом подключенных clisr-клиентов; топик
  с большим числом партиций, лимит - семафор вокруг `requestWithFilter` (round-robin
  по клиентам уже есть).

Итого формула: `партиции топика модели = число независимых обработчиков`,
`batch consumer = параллелизм внутри обработчика`. Никаких локов в БД.

Дополнительно через helm: отдельные Deployment с разными параметрами - например,
под только для GigaChat (env задает список обслуживаемых моделей/топиков, replicas=1).
Kafka-механика та же, helm дает явный контроль ресурсов и scaling per провайдер.

### 2.4 Учет токенов

- **Источник истины** - `usage` из ответа API: OpenAI `usage.prompt_tokens/completion_tokens`,
  GigaChat возвращает `usage` в том же духе, clisr-протокол расширяется обязательным
  полем `usage` в ответе клиента (локальный рантайм отдает фактические числа).
- Approx (tiktoken/`chars/4`) - ТОЛЬКО fallback, когда провайдер usage не вернул;
  такие записи помечаются `approx: true`.
- Клиентский подсчет остается для пре-флайта: усечение истории под `maxContextTokens`,
  оценка перед постановкой в очередь. Токенайзер - по `AIModelConfig.tokenizer`
  (для GigaChat - его `POST /tokens/count` либо калиброванное приближение).
- Списание с квоты: `billedTokens = (prompt + completion) * tokenMultiplier` уровня.
- В биллинг (`pushTokensData`) добавляются поля: `modelId`, `level`, `promptTokens`,
  `completionTokens`, `billedTokens`, `approx`.

### 2.5 Tool calls через clisr

Протокол clisr расширяется до многоходового цикла (как OpenAI tool loop):

```
pod (server)                          clisr client (локальная модель)
  -- chat.request {messages, toolDefs} -->
  <-- chat.response {tool_calls: [...]} --
  [pod выполняет инструменты локально - у него есть WorkspaceClient]
  -- chat.toolResults {results} -->
  <-- chat.response {content, usage} --
```

Ключевое: инструменты ВЫПОЛНЯЕТ под (там контекст workspace), clisr-клиент только
гоняет модель. `ServerLLMProvider.createChatCompletionWithTools` реализует цикл
(max N итераций), переиспользуя реестр из `src/utils/tools.ts`. Формат tool defs -
OpenAI JSON schema (уже сериализуется сейчас).

### 2.6 Персональные данные -> Preference

Память пользователя из блоба `ai-bot-phr-*` переезжает в Preference:

```ts
// models/ai-bot
@Model(aiBot.class.AIPersonalData, preference.class.Preference, DOMAIN_PREFERENCE)
class TAIPersonalData extends TPreference {
  assistantMemory!: string
  userMemory!: string
  sharedContext!: string
}
```

- `attachedTo: AccountUuid`, space `core.space.Workspace`; `PrivateMiddleware`
  (`foundations/server/packages/middleware/src/private.ts`) дает per-user изоляцию.
- ai-bot пишет от имени пользователя через `new TxOperations(client, userSocialId)`
  (паттерн pod-github, `services/github/pod-github/src/platform.ts:536`).
- Инструменты `update_user_memory` и т.п. пишут в Preference -> пользователь видит
  изменения вживую.
- Миграция: при первом обращении читаем старый блоб, создаем Preference + конвертируем
  историю в conversation (см. 2.7), блоб помечаем мигрированным.

### 2.7 Контексты разговоров как объекты (AIConversation)

Вместо единого массива `history` - несколько контекстов пользователя, по местам
возникновения, спроектированные как чаты. Пользователь может вернуться и посмотреть,
как он общался с моделями.

```ts
// DOMAIN_AI, space = PersonSpace пользователя (видит пользователь и система)
interface AIConversation extends Doc {
  title: string                    // тема: авто-генерация по первому сообщению
  summary?: Markup                 // авто-summary разговора (для поиска и списка)
  origin?: { objectId: Ref<Doc>, objectClass: Ref<Class<Doc>> }  // откуда начат
  level: 'low' | 'middle' | 'high'
  active: boolean                  // текущий контекст для этого origin
  totalTokens: number
  messages: number                 // collection size
}

interface AIConversationMessage extends AttachedDoc {  // attachedTo: AIConversation
  role: 'user' | 'assistant' | 'tool'
  content: Markup
  tokens: number
  modelId?: string
}
```

- Сообщения - отдельные записи (AttachedDoc), как в chunter: нужен полнотекстовый
  поиск по разговорам (fulltext индексация per message + по title/summary),
  пагинация и переиспользование механик чата.
- Форму сообщения держим совместимой с chunter `ChatMessage` (content: Markup,
  attachedTo), чтобы переиспользовать message-компоненты и интегрировать разговоры
  с ЮляИИ в чат в удобном виде; вариант "наследовать от chunter.class.ChatMessage"
  оценить при имплементации.
- `summary`: генерируется моделью при закрытии/ролловере разговора (дешевый уровень),
  используется в списке разговоров и как сжатый контекст при продолжении.
- Резолв контекста при запросе: активная conversation по (createdBy, origin),
  нет - создается новая. Команда/инструмент "начать заново" закрывает активную.
- Ролловер: при превышении лимита токенов активная закрывается (с summary),
  открывается новая - summary + хвост переносятся как стартовый контекст.
- В LLM уходит хвост сообщений активной conversation, усеченный по `maxContextTokens`
  (как сейчас `toLlmHistory`).
- UI: список разговоров (title/summary) + просмотр в виде чата - в секции
  настроек/панели ЮляИИ; поиск по сообщениям через стандартный fulltext.
- Чтение/запись только через платформенные документы -> нет write-back кеша в памяти,
  реплики не гоняются (порядок в пределах conversation гарантируется партиционированием
  по workspace/user в Kafka).

### 2.8 Секция в Settings

Новая секция "ЮляИИ" в личных настройках (паттерн TranslationSettings,
`models/contact/src/index.ts:1413`):

- `models/ai-assistant/src/index.ts`: `builder.createDoc(setting.class.SettingsCategory, ...)`,
  group `settings-account`.
- Компонент: просмотр/редактирование/очистка assistantMemory / userMemory / sharedContext
  (liveQuery на `AIPersonalData`), список conversations с просмотром и удалением.

### 2.9 UI-запросы по тексту и прогноз времени ответа

UI-операции (перевод, improve writing, summary) идут тем же pipeline
(`AIRequest.kind='text-op'`), с приоритетом выше chat (отдельный приоритетный топик
на модель либо приоритет внутри батча обработчика).

Прогноз для пользователя:

- Обработчик модели ведет EMA-метрики: `avgLatencyMs` (на 1k токенов ответа),
  `avgQueueWaitMs`; периодически публикует в статус-документ модели.
- При постановке: `estimatedFinishAt = now + ceil(queuePosition / batch) * avgBatchLatency + ownEstimate`;
  `queuePosition` = count pending `AIRequest` этой модели.
- UI: обратный отсчет/прогрессбар по `AIRequest.estimatedFinishAt` через liveQuery;
  при `processing` прогноз уточняется.
- Этап 2 - streaming для UI-операций у умеющих провайдеров: прогноз нужен только
  до первого токена.

Индикация в чате - через presence/pulse `TypingIndicator`
(`plugins/presence-resources/src/typing.ts`, `pulse.class.TypingIndicator`,
поле `status?: IntlString`):

- Обработчик при `status=processing` создает TypingIndicator от socialId бота на
  objectId чата - "ЮляИИ печатает...".
- Прогноз времени: расширить TypingIndicator опциональным полем (например
  `estimatedFinishAt?: Timestamp`) либо параметризованный IntlString - UI показывает
  "печатает, ~N сек".
- По done/failed индикатор снимается (`clearTyping`-аналог на стороне пода).

### 2.10 Санитизация markdown-ответов модели

Известная ошибка (см. `foundation-tasks/markdown-paste-marks-exclusion.md`):
`markdownToMarkup` создает text-узлы с невалидными комбинациями marks
(например `bold,code` - mark `code` в tiptap-схеме имеет `excludes: '_'`),
клиентские check-пути падают с `RangeError: Invalid collection of marks`.

LLM регулярно выдает markdown вида `` **`code`** `` - сейчас такой ответ
сохраняется в ChatMessage невалидным Markup
(`workspaceClient.ts:576`, `utils/tools.ts:94`).

Требование к pipeline: ВСЕ конверсии "ответ модели -> Markup"
(ChatMessage, AIConversationMessage.content, AIConversation.summary, результаты
text-op, документы из tools) проходят через общую schema-aware санитизацию
(чистка неизвестных узлов/marks + применение mark-exclusion правил через
PM `Mark.addToSet`). Утилиту вынести в `@hcengineering/text-markdown`,
переиспользовать в smartPaste редактора и в ai-bot.

## 3. Масштабирование ai-bot

Ограничение: БД за pg-bouncer -> никаких advisory locks / межтранзакционных
`FOR UPDATE`. Координация реплик - исключительно Kafka (владение партициями).

Рекомендуемая схема:

| Роль | Масштабирование | Состояние |
|---|---|---|
| Gateway (REST, love, транскрипция, диспетчер ai-queue) | N реплик, consumer group на входном топике | stateless (все в БД/blob) |
| Обработчик модели (`llm-<modelId>`) | реплик >= партиций; активных = партиций | stateless, метрики - в статус-документе |

Обязательные шаги:
1. Убрать write-back кеш `historyMap` как источник истины (история -> AIConversation,
   память -> Preference).
2. REST `/events` -> публикация во входной топик вместо прямой обработки.
3. Per-model топики + batch consumers (см. 2.3).
4. `AIControl.workspaces` остается кешем подключений - допустимо per-replica.

Деплой-варианты обработчиков (на выбор позже):
- Один бинарь, все топики: каждый под подписан на все `llm-*` топики, Kafka сама
  раздает партиции. Проще деплой, рекомендуется на старте.
- Отдельный Deployment per провайдер: изоляция ресурсов, независимый scaling. Позже,
  если clisr/локальные модели начнут конкурировать за CPU с gateway.

## 4. Локальные модели через clisr параллельно с остальными

Сейчас clisr - глобальный режим (`LLM_PROVIDER=server`). Целевое поведение:
clisr - один из провайдеров в реестре, живет параллельно с openai/gigachat.

clisr требует сервер - выделяем его в роль **clisr router**:

```
ai-bot поды (провайдер 'clisr')          обработчики запросов (clisr-клиенты)
        \                                /
         --->  clisr router (один)  <---
               формат/протокол clisr
```

- Router - один экземпляр (или per-зона), держит clisr-протокол; к нему подключаются
  N обработчиков запросов (clisr-клиенты: локальные модели, hosted Intabia, он-прем).
- Обработчики при handshake регистрируют обслуживаемые модели (capabilities);
  router маршрутизирует по фильтру + round-robin (`requestWithFilter` уже есть).
- ai-bot поды - клиенты router-а: `AIModelConfig{provider:'clisr', endpoint:<filter>}`.
- Hosted-модель Intabia = обработчики на нашем оборудовании, уровень `low`
  (самая дешевая/медленная), фиксированное имя.
- Локальная/он-прем модель клиента = такой же обработчик с другим именем.
