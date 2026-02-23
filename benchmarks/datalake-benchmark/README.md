# Datalake Benchmark

Нагрузочное тестирование Datalake сервиса (blob storage) на Go.

## Установка

```bash
cd benchmarks/datalake-benchmark
go mod tidy
go build -o datalake-benchmark main.go
```

## Использование

### Полный цикл: загрузка + бенчмарк
```bash
./datalake-benchmark -c=50 -d=30s
```

### С мониторингом памяти
```bash
./datalake-benchmark -c=100 -d=60s -monitor-memory -container=dev-datalake-1
```

### Повторный запуск без загрузки (используем ранее загруженные blob-ы)
```bash
./datalake-benchmark -blob-list=/tmp/datalake_blobs.txt -c=200 -d=60s
```

### Тест с большими файлами
```bash
./datalake-benchmark -blobs=10 -blob-sizes=1048576,5242880,10485760 -c=50 -d=30s
```

### Тест с маленькими файлами (попадают в кеш datalake, <64KB)
```bash
./datalake-benchmark -blobs=50 -blob-sizes=1024,4096,16384 -c=100 -d=30s
```

## Параметры

| Флаг | По умолчанию | Описание |
|------|-------------|----------|
| `-url` | `http://huly.local:4030` | URL datalake сервиса |
| `-c` | `50` | Количество одновременных соединений |
| `-d` | `30s` | Длительность теста |
| `-t` | `10s` | Таймаут запроса |
| `-secret` | `secret` | JWT секрет |
| `-workspace` | `00000000-...` | UUID workspace |
| `-account` | `00000000-...` | UUID account |
| `-blobs` | `20` | Количество тестовых blob-ов для загрузки |
| `-blob-sizes` | `1024,10240,102400,1048576` | Размеры blob-ов (bytes) |
| `-container` | `dev-datalake-1` | Docker контейнер для мониторинга памяти |
| `-monitor-memory` | `false` | Мониторинг памяти контейнера |
| `-skip-upload` | `false` | Пропустить загрузку |
| `-blob-list` | `` | Файл со списком blob имён |

## Как работает

1. **Генерация JWT** — создаёт HS256 токен с account и workspace (совместим с jwt-simple)
2. **Загрузка blob-ов** — `POST /upload/form-data/:workspace` с multipart form-data
3. **Бенчмарк скачивания** — параллельные `GET /blob/:workspace/:name` запросы
4. **Результаты** — RPS, latency, throughput, status codes, память контейнера

## Результаты

Benchmark выводит:
- **Requests**: общее количество, успешные/неудачные, RPS
- **Latency**: min/max/avg
- **Throughput**: общий объём и скорость в MB/s
- **Status Codes**: распределение HTTP статусов
- **Memory Usage**: использование памяти контейнера (если включено)
