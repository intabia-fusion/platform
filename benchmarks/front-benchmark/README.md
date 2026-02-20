# Front Service Benchmark

Нагрузочное тестирование front сервиса на Go с поддержкой рандомных файлов из контейнера.

## Установка

```bash
cd benchmarks/front-benchmark
go mod tidy
go build -o front-benchmark main.go
```

## Использование

### Базовый тест (index.html)
```bash
./front-benchmark
```

### Рандомные файлы из контейнера
```bash
./front-benchmark -random -c=100 -d=30s
```

### Тест с сохранённым списком файлов
```bash
# Сначала получаем список файлов
./front-benchmark -random -c=10 -d=1s
# Или вручную: docker exec dev-front-1 find /app/dist -type f > /tmp/files.txt

# Потом используем список
./front-benchmark -files=/tmp/dist_files.txt -c=200 -d=60s
```

## Параметры

- `-url` - Базовый URL (default: `http://huly.local:8087`)
- `-c` - Количество одновременных соединений (default: 50)
- `-d` - Длительность теста (default: 30s)
- `-t` - Таймаут запроса (default: 10s)
- `-random` - Использовать рандомные файлы из контейнера
- `-container` - Имя Docker контейнера (default: `dev-front-1`)
- `-files` - Файл со списком путей для запросов
- `-exact` - Использовать URL как есть без добавления путей (для тестирования конкретных endpoints)

## Режимы работы

### Exact mode (новый!)
Использует URL точно как указан, без добавления путей:
```bash
./front-benchmark -url=http://huly.local:8087/config.json -exact -c=100
```

### Append mode (по умолчанию)
Добавляет файлы к базовому URL:
```bash
# С рандомными файлами
./front-benchmark -random -c=100

# С файлом списка
./front-benchmark -files=/tmp/files.txt -c=100

# Fallback на index.html
./front-benchmark -url=http://huly.local:8087 -c=100
```

## Примеры

### Быстрый тест
```bash
./front-benchmark -c=10 -d=10s
```

### Высокая нагрузка с рандомными файлами
```bash
./front-benchmark -random -c=200 -d=60s
```

### Тест конкретного файла
```bash
./front-benchmark -url=http://huly.local:8087/index.html -c=100 -d=30s
```

### Другой контейнер
```bash
./front-benchmark -random -container=my-front-container -c=50
```

## Результаты

Benchmark выводит:
- **Requests**: общее количество, успешные, неудачные, RPS
- **Latency**: min/max/avg, процентили (P50, P90, P95, P99)
- **Throughput**: общий объём и скорость в MB/s
- **Status Codes**: распределение HTTP статусов

### Пример вывода
```
=== Benchmark Results ===

Requests:
  Total:      2000
  Successful: 2000 (100.00%)
  Failed:     0 (0.00%)
  RPS:        66.67

Latency:
  Min:    5.506375ms
  Max:    821.484166ms
  Avg:    50.432878ms
  P50:    31.342958ms
  P90:    67.200542ms
  P95:    73.25375ms
  P99:    535.759834ms

Throughput:
  Total: 134.51 MB
  Rate:  4.48 MB/s

Status Codes:
  200: 2000 (100.00%)
```

## Файлы в контейнере

Контейнер `dev-front-1` содержит 2464 файла в `/app/dist`:
- 1157 .gz файлов
- 1030 .js файлов
- 119 .map файлов
- 52 .svg файлов
- 38 .png файлов
- и другие

При использовании `-random` benchmark автоматически извлекает список файлов из контейнера и сохраняет в `/tmp/dist_files.txt`.
