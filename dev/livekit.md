# Запуск LiveKit локально с вебхуками для сервиса love

## Обзор
Этот документ описывает, как запустить LiveKit Server локально в режиме разработки с вебхуками, направленными в ваш сервис love, который запускается в docker-compose.

## Требования
- Установленный Docker и Docker Compose
- Уже запущенный сервис love в docker-compose
- Установленный LiveKit Server (через Homebrew, бинарный файл или Docker)

## Установка LiveKit Server

### Вариант 1: Установка через Homebrew (для macOS)
```bash
brew install livekit/livekit/livekit-server
```

### Вариант 2: Загрузка бинарного файла
Скачайте последнюю версию с https://github.com/livekit/livekit-server/releases

### Вариант 3: Запуск через Docker (рекомендуется)
```bash
docker run --rm -p 7880:7880 -p 7881:7881 \
  -e LIVEKIT_CONFIG="api_key: devkey
api_secret: secret
webhook:
  urls: [\"http://host.docker.internal:8096/api/livekit/webhook\"]
  api_key: devkey
  api_secret: secret" \
  livekit/livekit-server --dev
```

## Конфигурация вебхуков для сервиса love

Чтобы LiveKit отправлял вебхуки в ваш сервис love, запущенный в docker-compose:

1. Убедитесь, что сервис love запущен и доступен на порту 8096
2. Настройте LiveKit Server с URL вебхука, указывающим на ваш сервис love

## Запуск LiveKit Server с вебхуками

### Запуск через Docker (рекомендуется)
```bash
docker run -d --name livekit-server \
  -p 7880:7880 \
  -p 7881:7881 \
  -e LIVEKIT_CONFIG="api_key: devkey
api_secret: secret
webhook:
  urls: [\"http://host.docker.internal:8096/api/livekit/webhook\"]
  api_key: devkey
  api_secret: secret" \
  livekit/livekit-server --dev
```

### Запуск локально установленного сервера

#### Вариант 1: С использованием конфигурационного файла
```bash
livekit-server --config ./livekit-dev-config.yaml
```

#### Вариант 2: С передачей конфигурации через параметр
```bash
livekit-server \
  --dev \
  --config-body "api_key: devkey
api_secret: secret
webhook:
  urls: [\"http://127.0.0.1:8096/api/livekit/webhook\"]
  api_key: devkey
  api_secret: secret"
```

## Проверка подключения

1. Запустите вашу систему через docker-compose:
   ```bash
   docker-compose up -d love
   ```

2. Запустите LiveKit Server (одним из способов выше)

3. Проверьте, что сервисы могут взаимодействовать:
   - LiveKit Server будет доступен на ws://localhost:7880
   - Ваш сервис love будет доступен на http://localhost:8096
   - Вебхуки будут отправляться из LiveKit в ваш сервис love

## Конфигурация сервиса love

Убедитесь, что ваш сервис love настроен для приема вебхуков от LiveKit:
- Конечная точка: `/api/livekit/webhook`
- Проверка подлинности с использованием API ключа и секрета

## Тестирование вебхуков

1. Создайте комнату в LiveKit (сгенерировав сначала JWT токен):
   ```bash
   # Сгенерируйте API ключ и секрет (если еще не сделали этого)
   livekit-server generate-keys

   # Или используйте API напрямую с вашими ключами:
   curl -X POST http://localhost:7881/twirp/livekit.RoomService/CreateRoom \
     -H "Content-Type: application/json" \
     -d '{"name": "test-room", "metadata": "test"}' \
     -H "Authorization: Bearer YOUR_JWT_TOKEN"
   ```

   Для генерации JWT токена вы можете использовать библиотеки в вашем языке программирования с ключом "devkey" и секретом "secret".

2. Проверьте логи сервиса love для подтверждения получения вебхуков:
   ```bash
   docker-compose logs love
   ```

## Устранение неполадок

### Проблемы с сетью
- При использовании Docker, `host.docker.internal` позволяет контейнеру обращаться к хосту
- Убедитесь, что порт 8096 сервиса love доступен из контейнера LiveKit

### Проблемы с вебхуками
- Проверьте, что конечная точка `/api/livekit/webhook` реализована в вашем сервисе love
- Убедитесь, что сервис love принимает POST-запросы
- Проверьте логи сервиса love на наличие ошибок

### Проверка JWT токенов
- Для генерации JWT токенов используйте ключ `devkey` и секрет `secret`
- Пример генерации токена можно найти в документации LiveKit

## Egress (Запись) и локальное тестирование

Egress — отдельный сервис, который экспортирует и записывает сессии LiveKit (MP4, HLS, RTMP и т.д.) и загружает результаты в S3-совместимое хранилище. Для локальной разработки выполнены базовые настройки, позволяющие проверить запись в вашем окружении.

Ключевые изменения и файлы:
- Конфиг Egress: `foundation/dev/livekit-egress-config.yaml` (настроен на `ws://huly.local:7880`, `redis: redis:6379`, загрузка в Minio `minio:9000`, bucket `livekit-recordings`).
- Обновлён LiveKit dev-config: `foundation/dev/livekit-dev-config.yaml` — добавлен блок `redis: 127.0.0.1:6379`, чтобы сервер LiveKit (запущенный на хосте) использовал тот же Redis, что и Egress.
- Docker: в `dev/docker-compose.yaml` добавлен сервис `livekit-egress` (image `livekit/egress`), монтирующий конфиг и подключённый к `redis`/`minio`.

Как проверить локально:
1. Запусти LiveKit на хосте:
   - `bash dev/run_livekit.sh` (сервер доступен на ws://localhost:7880)
2. Подними необходимые сервисы:
   - `docker-compose up -d redis minio love`
   - и затем запусти egress: `docker-compose up -d livekit-egress` (или `docker-compose up -d` для всего стека)
3. В приложении создай/присоединись к митингу. В триггерах платформы реализован автоматический вызов старта записи при создании митинга и остановки при завершении (см. `server-plugins/love-resources`), поэтому для проверки достаточно просто зайти и выйти из комнаты. При желании можно запускать вручную через UI или REST: `POST /startRecord` и `POST /stopRecord` на сервисе love.
4. Следи за логами:
   - `docker-compose logs -f livekit-egress`
   - `docker-compose logs -f love`
   - `docker logs livekit-server` (если LiveKit запущен в Docker)
5. По завершении записи Egress загрузит MP4 в Minio (bucket `livekit-recordings`), а сервис `love` получит webhook `egress_ended`, скачает файл и прикрепит его к митингу как вложение.

Советы по отладке:
- Убедись, что Redis доступен и порт 6379 проброшен на хост (для LiveKit) и доступен в контейнерах как `redis:6379`.
- Проверь, что в Minio существует bucket `livekit-recordings` (создай при необходимости).
- Если запись не стартует — проверь логи Egress, LiveKit и Love; обычно проблемы связаны с доступом к Redis или с настройкой S3/Minio.

## Полезные команды

- Проверка состояния LiveKit: `curl http://localhost:7881/debug/status`
- Просмотр логов LiveKit (если запущен в Docker): `docker logs livekit-server`
- Проверка логов сервиса love: `docker-compose logs love`
- Генерация API ключей: `livekit-server generate-keys`
- Проверка используемых портов: `livekit-server ports`

## Примечания по безопасности

- Ключи API, используемые здесь, только для разработки
- Не используйте эти же ключи в продакшене
- Вебхуки должны быть защищены надлежащей аутентификацией в продакшене
