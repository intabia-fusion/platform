# UI Sanity testing using play-wright

## Prepare environment with docker to test final product.

Two variants, first use a local build and use an already build version.

### A local build

```bash
pnpm install
pnpm build
pnpm bundle
pnpm docker:build
./prepare.sh
```

To try a code change on a running stand without losing its data, rebuild the images and recreate only the service containers and nginx - postgres, minio, redpanda and elastic keep running with their volumes:

```bash
pnpm docker:build
./reload-pg.sh             # every service built from local images
./reload-pg.sh front0      # only the listed services
```

### An already build version

Сценарий поднятия compose-стенда (localhost:8083) с пином образов версии ушёл
вместе с compose-backend `prepare-pg.sh`: `create-version-override.sh` и
`reset-version.sh` остались для исторических compose-стендов, sanity-стенд
поднимается только в Kubernetes, см. "Sanity на Kubernetes" ниже.

```bash
./create-version-override.sh v0.7.309 # Will create a version override file.
./reset-version.sh # To go back to local build
```

### Custom image for a single service

(Исторически, для compose-стенда.) Каждый образ сервиса платформы можно было
заменить через `<IMAGE_NAME>_IMAGE` - имя образа в верхнем регистре, `-`
заменяется на `_` (`transactor` -> `TRANSACTOR_IMAGE`, `rekoni-service` ->
`REKONI_SERVICE_IMAGE`). Файл версий из `create-version-override.sh` пинил все
образы и имел приоритет. На Kubernetes-стенде выбор образов идёт через values
стенда (`global.imageRegistry`, `global.version`) и `pnpm -w stand:push`, образ
tool-пода - через `STAND_TOOL_IMAGE` в prepare.

### Restore to pure DB

To purge content of sanity workspace following command could be used.

```bash
./restore-workspace.sh
```

## Prepare local dev environment

```bash
pnpm install
pnpm build
pnpm bundle
./create-local.sh
```

### Restore to pure DB for Local setup

To purge content of sanity workspace following command could be used.

```bash
./restore-local.sh
```

## Running UI tests

```bash
cd ./sanity
pnpm run uitest # for docker setup
pnpm run dev-uitest # for dev setup
```

### Sanity на Kubernetes

```bash
cd tests
./prepare-pg.sh            # Kubernetes-стенд по умолчанию (stand:configure)

# Во втором терминале, HTTP UI с proxy в стенд (порт :8081, т.к. webpack :8080 занят dev)
pnpm -w stand:test:front

# В третьем
cd tests/sanity
pnpm run uitest:k8s
```

Prepare работает против Kubernetes, настроенного через `pnpm -w stand:configure`
(kubeconfig/context/namespace, runtime k3d/kind/existing), и удаляет namespace
стенда (STAND_NAMESPACE из configure, иначе `fusion-sanity` из values) и только
данные sanity: БД, buckets, индекс и Kafka-топики с суффиксом `-sanity`. Затем
Helm поднимает чистый стенд, а `dev/test-base` создаёт аккаунты и восстанавливает
дампы внутри pod `stand-tool` (удаляется по выходу prepare). Compose-сценария
для `prepare-pg.sh` нет - Kubernetes единственный backend. Для
`STAND_RUNTIME=existing`
без push Docker не нужен: stand-tool берёт pullable-образ, медиа-фикстуры должны
уже лежать в `tests/sanity/tests/files`. Опции `--full`, `--docs`,
`--profile` и `--asr` не поддерживаются. В values sanity
задан `useOtp: "false"`, как `USE_OTP=false` в compose. Webpack получает config и
branding самого стенда; его порт можно сменить через `STAND_FRONT_PORT`
(по умолчанию 8081).

Smoke-проверка входа: `cd tests/sanity && pnpm run uitest:k8s tests/login.spec.ts --workers=1`.

## Debugging UI tests

```bash
cd ./sanity
pnpm run debug -g test-name # for docker setup
pnpm run dev-debug -g test-name # for local setup
```

## Capturing new testing scenarios

```bash
pnpm run codegen # for docker setup
pnpm run dev-codegen # for local setup
```

## AI bot tests

Two levels are configured in `tests/config-aibot.yaml`:

- **`low`** (default) — mock provider in echo mode: replies with the whole received context as
  markdown, so tests assert what actually reached the model. Offline, runs in CI.
- **`middle`** — a real local model via the `aibot_client_llm` clisr worker. Only the `@llm`
  suite uses it; without a model server the level simply has no worker.

Base tests need nothing extra — they are part of `pnpm run uitest`.

### Real-LLM suite (@llm)

1. Serve a mid-size model on the host over an OpenAI-compatible API at
   `http://localhost:8000/v1` (LM Studio, llama.cpp, vLLM). Override with `LLM_TEST_ENDPOINT`,
   `LLM_TEST_MODEL`, `LLM_TEST_API_KEY`.
2. The stand already runs `aibot_client_llm`; it idles until the endpoint answers.
3. Run:

```bash
cd tests/sanity
pnpm run run-uitests                 # whole @llm suite
pnpm run run-uitests -g 'factual'    # single test
```

Tests switch the workspace to `middle` through the ai-bot API (`POST /levels/workspace`,
owner or system token). Replies are not deterministic, so they assert behaviour (an answer
arrives, a fact is carried across turns), not exact text.

### Real transcription (ASR)

The default stand has no ASR: the `asr:` provider in `config-aibot.yaml` is off
and nothing is transcribed. Two opt-in modes add a clisr STT worker
(`aibot_client_asr`, `docker-compose.asr.yaml`) and turn the provider on. Оба
были частью compose-стенда (`./prepare-pg.sh --asr` /
`--asr-local`); на Kubernetes-стенде ASR пока не поднимается - оверлеев
`docker-compose.asr.yaml`/`docker-compose.oaitt.yaml` в prepare нет.

The worker calls the OpenAI-compatible `/v1/audio/transcriptions`; its registry is `config-aibot-asr.yaml`.

## Test authoring.

Please update all navigation with using PlatformURI for CI and dev environment compatible testing.

## Time-machine + webhook

`time-machine` (delayed-event scheduler) and `webhook` (inbound webhook API) run as part of this
stand (`docker-compose.yaml`). `time-machine`'s `POLL_INTERVAL` is set to 2s here (vs. the 20s
prod default) so a scheduled-retry test doesn't have to wait.

Check it's alive:

```bash
docker compose logs time-machine | grep 'Time Machine worker started'
curl http://localhost:8083/_webhook/health   # {"status":"ok"}
```

Inspect the delayed-events table (`time_machine.delayed_events`, schema created by the service
itself on start):

```bash
docker compose exec postgres psql -U postgres -p 5433 -c 'select * from time_machine.delayed_events;'
```

## Generate Allure

```bash
allure generate allure-results -o allure-report --clean
allure open allure-report
```
