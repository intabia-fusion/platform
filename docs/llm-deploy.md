# ЮляИИ (ai-bot): конфигурация и деплой

Один бинарь `intabiafusion/ai-bot`, роль выбирается через `MODE`. Очереди Kafka -
развязка между ролями, поэтому масштабировать роли можно независимо. Архитектура:
`docs/llm.md`, задачи: `docs/llm-tasks.md`.

## Роли (MODE)

| MODE | Читает из Kafka | Поднимает | Назначение |
|------|-----------------|-----------|------------|
| `all` (= `queue`) | ai-queue, llm-`<id>`, love, stt | ClisrServer (llm+stt) | Всё в одном поде. Dev / небольшой прод. |
| `event-router` | ai-queue | - | Резолв модели по `event.level`, перекладка в `llm-<id>`. Точка входа для transactor. |
| `llm-router` | llm-`<id>` (для своих) | ClisrServer (llm), только если есть clisr-провайдер | Выполняет LLM-запросы. Для clisr-моделей к нему подключаются обработчики. |
| `stt-worker` | stt-queue | ClisrServer (transcription) | Транскрибация. Транскрибаторы подключаются как clisr-клиенты. |
| `client` | - | - (clisr-клиент) | Обработчик: подключается к router/серверу, выполняет LLM/STT. |

**stt-ingest вездесущ.** Приём аудио (`POST /love/send_raw`, `/love/send_session`),
создание placeholder-сообщения, постановка задачи в `TranscriptionQueue` и обработка
meeting-lifecycle (`LoveQueue`) запускаются в КАЖДОЙ роли (кроме `client`). Это
stateless и дёшево, поэтому love может слать аудио на любой под. Без этого аудио,
пришедшее на под без stt-роли, потерялось бы.

**REST API** (`/levels`, `/translate`, `/love/*`) поднимается во всех ролях
(`finalize` зовёт `createServer`). `GET /levels` отдаёт каталог уровней (`AILevelInfo[]`)
для UI-пикера - каталог одинаков для всех, живёт в поде, не в БД.

## Топология прод (пример)

```
UI -> transactor -> [event-router]   ai-queue -> llm-<id> топики
                          |
       +------------------+------------------+
       v                  v                  v
 [llm-router          [llm-router        [stt-worker]
  LLM_PROVIDER_IDS=    LLM_PROVIDER_IDS=   <-clisr- транскрибаторы
  gigachat]            clisr]
                       <-clisr- LLM-обработчики

love -> POST /love/send_raw -> любой под (stt-ingest) -> stt-queue -> [stt-worker]
```

- `event-router`: реплицируется (consumer-group), без состояния.
- `llm-router`: один деплой на провайдера (или группу). `LLM_PROVIDER_IDS` задаёт
  какие `llm-<id>` топики читать. Партиций у топика = число независимых обработчиков
  (GigaChat = 1 -> ровно один активный под, без локов БД).
- `stt-worker`: реплицируется (consumer-group делит партиции `TranscriptionQueue`).

## Реестр провайдеров

Источник - YAML (`CONFIG_PATH`/`CONFIG_YAML`) или legacy env. YAML:

```yaml
llm:
  defaultLevel: low          # уровень по умолчанию (id из levels ниже)
  providers:
    - id: gigachat           # = суффикс топика llm-gigachat
      provider: gigachat     # openai | gigachat | clisr
      concurrency: 1         # общий RateLimiter
      batch: 1               # размер батч-консьюмера
      endpointConfig:        # общий auth (один клиент на провайдер)
        credentials: '...'
        scope: GIGACHAT_API_PERS
      levels:                # один провайдер -> несколько уровней
        low:    { model: GigaChat-Lite, tokenMultiplier: 1, order: 0, label: 'Lite' }
        middle: { model: GigaChat,      tokenMultiplier: 2, order: 1, label: 'Base' }
        high:   { model: GigaChat-Pro,  tokenMultiplier: 4, order: 2, label: 'Pro' }
    - id: clisr
      provider: clisr
      concurrency: 4
      batch: 1
      levels:
        low: { model: local, tokenMultiplier: 0.1, order: 0, label: 'Local' }
```

Если `llm.providers` не задан - реестр синтезируется из legacy env
(`LLM_PROVIDER` + `OPENAI_*` / `GIGACHAT_*`) как один провайдер уровня `defaultLevel`.

- `AILevel` = свободная строка-id (не enum). UI читает уровни из `GET /levels`,
  сортирует по `order`, показывает `label`/`description`.
- `tokenMultiplier`: `billedTokens = (prompt+completion) * tokenMultiplier`.
- Уровень запроса = свойство запроса; пространство задаёт потолок (`AILevelSetting`).
  Server-trigger кладёт активный уровень в `event.level`, под выполняет.

## Переменные окружения

### Общие (все роли кроме client)
| Env | Назначение |
|-----|------------|
| `MODE` | роль (см. таблицу выше), по умолчанию `queue`=`all` |
| `ACCOUNTS_URL` | account-сервис |
| `SERVER_SECRET` | секрет токенов |
| `SERVICE_ID` | id сервиса (по умолчанию `ai-bot-service`) |
| `API_TOKEN` | токен авторизации clisr-клиентов |
| `PORT` | порт HTTP/WS (по умолчанию 4010) |
| `QUEUE_CONFIG` | Kafka/redpanda |
| `STORAGE_CONFIG`, `CHUNK_STORAGE_CONFIG` | хранилище (blob + аудио-чанки) |
| `STATS_URL`, `BILLING_URL`, `LOVE_ENDPOINT` | сервисы |
| `FIRST_NAME`, `LAST_NAME`, `PASSWORD`, `AVATAR_*` | идентичность бота |
| `MAX_CONTENT_TOKENS`, `MAX_HISTORY_RECORDS` | лимиты контекста |

### LLM
| Env | Назначение |
|-----|------------|
| `AI_DEFAULT_LEVEL` | уровень по умолчанию (если нет yaml) |
| `LLM_PROVIDER_IDS` | для `llm-router`: csv id провайдеров (пусто = все из реестра) |
| `LLM_PROVIDER` | legacy: `openai`\|`gigachat`\|`server`/`clisr` (если нет yaml.providers) |
| `LLM_BATCH` | legacy размер батча |
| `OPENAI_API_KEY`, `OPENAI_MODEL`, `OPENAI_BASE_URL`, `OPENAI_SUMMARY_MODEL`, `OPENAI_TRANSLATE_MODEL` | OpenAI |
| `GIGACHAT_CREDENTIALS`, `GIGACHAT_SCOPE`, `GIGACHAT_MODEL`, `GIGACHAT_BASE_URL`, `GIGACHAT_TIMEOUT` | GigaChat |

### STT
| Env | Назначение |
|-----|------------|
| `STT_PROVIDER` | `wsr`\|`openai`\|`server`(clisr)\|... |
| `STT_URL`, `STT_API_KEY`, `STT_MODEL` | endpoint провайдера |
| `STT_BATCH` | размер батча транскрипции |
| `VAD_RMS_THRESHOLD`, `VAD_SPEECH_RATIO_THRESHOLD` | VAD |
| `DEEPGRAM_API_KEY`, `DEEPGRAM_PROJECT_ID`, `DEEPGRAM_TAG`, `DEEPGRAM_POLL_INTERVAL_MINUTES` | Deepgram |

### client (обработчик)
| Env | Назначение |
|-----|------------|
| `MODE=client` | обработчик |
| `SERVER_URL` | ws-адрес router/сервера (напр. `ws://aibot:4010`) |
| `API_TOKEN` | должен совпасть с router |
| LLM_* / STT_* | какой провайдер выполняет (capability объявляется по наличию провайдера) |

## docker-compose dev

`dev/docker-compose.yaml`:
- `aibot` `MODE=all` - всё в одном (event-router + llm-router + stt-worker + ingest).
  Локальные модели/STT через подключающихся клиентов.
- `aibot_client_llm` `MODE=client` (`SERVER_URL=ws://aibot:4010`, openai) - LLM-обработчик.
- `aibot_client_stt` `MODE=client` (openai stt) - STT-обработчик.
- `transactor.AI_BOT_URL=http://aibot:4010`, `love.AGENTS`, `love-agent.PLATFORM_URL`.

Для проверки разделённой топологии: заменить `aibot` тремя сервисами с
`MODE=event-router` / `MODE=llm-router` (+`LLM_PROVIDER_IDS`) / `MODE=stt-worker`,
направить клиентов на нужный router (`SERVER_URL`).
