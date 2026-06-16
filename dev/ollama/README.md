# Локальный Ollama для ai-bot e2e

OpenAI-совместимый LLM-сервер в Docker для e2e-тестов ai-bot. Малая модель
Qwen2.5-0.5B-Instruct (tool calling + usage), быстрый ответ (~1-2 c на CPU).

## Запуск

```bash
cd dev/ollama
./run.sh                 # CPU, q8 модель (qwen2.5:0.5b-instruct-q8_0)
./run.sh --fp16          # bf16/fp16 вариант
./run.sh --gpu           # резерв NVIDIA GPU (нужен nvidia-container-toolkit)
MODEL=qwen2.5:1.5b-instruct-q8_0 ./run.sh   # другая модель
```

Скрипт поднимает контейнер, ждёт готовности, тянет модель. Эндпоинт:
`http://127.0.0.1:11434/v1` (без ключа; тесты передают любой, напр. `ollama`).

### Baked-образ (offline, для CI/тестов)

Модель запечена в образ `intabiafusion/ollama-base` - старт без скачивания.

```bash
# Собрать образ (один раз; модель тянется на build):
cd dev/base-image && ./build.sh        # или только ollama-таргет
# Поднять (без volume, без pull):
cd dev/ollama && docker compose -f docker-compose.baked.yaml up -d
```

Модель образа: `OLLAMA_MODEL` build-arg (по умолчанию `qwen2.5:0.5b-instruct-q8_0`).

## Прогон e2e против ollama

```bash
cd services/ai-bot/pod-ai-bot
AI_BOT_E2E=1 \
  AI_BOT_E2E_URL=http://127.0.0.1:11434/v1 \
  AI_BOT_E2E_KEY=ollama \
  AI_BOT_E2E_MODEL=qwen2.5:0.5b-instruct-q8_0 \
  npx jest e2e
```

Покрывает: `e2e-tools` (tool calling), `e2e-clisr-router` (router+client loop),
`e2e-usage` (usage из API). Без `AI_BOT_E2E=1` все e2e скипаются.

Выбор модели в тестах: `AI_BOT_E2E_MODEL` (точное имя) -> иначе первая
gpt-oss/qwen из `/v1/models` -> иначе первая доступная.

## Файлы

- `docker-compose.yaml` - сервис ollama (CPU).
- `docker-compose.gpu.yaml` - override с резервом NVIDIA GPU (для сервера).
- `run.sh` - запуск + pull модели + проверка.

## Остановка

```bash
cd dev/ollama && docker compose down          # оставить том с моделями
cd dev/ollama && docker compose down -v        # удалить и том
```
