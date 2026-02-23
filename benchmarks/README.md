# Front Service Benchmarks

This directory contains benchmarking tools and results for the front service performance testing.

## Tools

- `front-benchmark/` - Go-based HTTP load testing tool
- `run_benchmark.sh` - Automated benchmark script
- `results/` - Benchmark results storage

## Optimizations Applied (2026-02-20)

### Build Optimizations
- **Brotli + Gzip compression** - dual compression for all assets
- **Code splitting** - vendors separated by usage (editor, charts, datetime)
- **Emoji data split** - 30 language-specific chunks, lazy loaded
- **Translation grouping** - 12 language bundles instead of 697 JSON files
- **Chunk size optimization** - minSize: 50KB to avoid tiny files

### Runtime Optimizations (Node.js)
- **In-memory file cache** - pre-loaded with pre-computed headers
- **Last-Modified caching** - single stat() at startup
- **HTTP/2 optimized chunks** - max 244KB for multiplexing
- **Brotli priority** - serves .br files when client supports

### Results
- Vendors: 58MB → 10.4MB (-82%)
- Vendors (Brotli): 2.3MB (-79%)
- JS files: 1,030 → 110 (-89%)
- Total files: 2,900 → 594 (-80%)

## Usage

### Quick Benchmark

```bash
# Run benchmark against current front service
cd front-benchmark
go build -o front-benchmark .

# Benchmark with random files from container
./front-benchmark \
  -url http://localhost:8087 \
  -c 50 \
  -d 30s \
  -random \
  -container dev-front-1

# Benchmark specific URL
./front-benchmark \
  -url http://localhost:8087/config.json \
  -c 50 \
  -d 30s \
  -exact
```

### Automated Benchmark

```bash
# Run full benchmark suite
./run_benchmark.sh
```

## Latest Results

See `results/` directory for detailed benchmark reports.

### 2026-02-21: Streaming + middleware optimization

**Changes:**
- **Streaming for large files** - `res.end(buffer)` replaced with `Readable.pipe(res)` for files > `SEND_BUFFER_SIZE` (default 64KB). Prevents event loop blocking during large file transfers.
- **Selective middleware** - `body-parser` and `express-fileupload` removed from global middleware chain, applied only to POST routes that need them.
- **Configurable buffer size** - `SEND_BUFFER_SIZE` env variable to tune streaming threshold.
- **Mixed workload benchmark** - new `-mixed` flag to test config.json latency during concurrent file loading.

#### Isolated scenarios (100 connections, 15s)

| Scenario | Node RPS | Nginx RPS | Node Avg Latency | Nginx Avg Latency |
|----------|----------|-----------|------------------|-------------------|
| config.json | **11,397** | 6,168 | **8.2ms** | 15.7ms |
| index.html | 12,810 | **32,892** | 7.3ms | **1.5ms** |
| Random files | 2,978 | **3,431** | 20.7ms | 25.4ms |

#### Mixed workload: files + config.json (100 file conns + 10 config.json conns)

| Metric | Node (streaming) | Nginx+Node |
|--------|------------------|------------|
| **config.json avg latency** | **19.7ms** | 59.4ms |
| **config.json max latency** | **264ms** | 511ms |
| **config.json RPS** | **455** | 167 |
| Files RPS | 2,640 | **3,153** |
| Files avg latency | **26ms** | 27ms |
| Memory | 336–363 MB | 170–172 MB |

**Key findings:**
- Node.js with streaming: config.json stays responsive (20ms avg) under heavy file load
- Nginx proxy_pass adds latency for config.json in mixed workload (59ms avg)
- Nginx uses less memory (~170MB vs ~350MB) since files served from filesystem
- Node.js is 2x faster for API endpoints (config.json) due to no proxy overhead

### 2026-02-20: Optimized Node.js vs Nginx+Node

After optimizations (Brotli/Gzip compression, improved caching, code splitting):

| Scenario | Node.js RPS | Nginx RPS | Node Latency | Nginx Latency |
|----------|-------------|-----------|--------------|---------------|
| config.json (API) | **10,790** | 4,848 | 8.77ms | 20.07ms |
| index.html (SPA) | 12,899 | **17,806** | 7.25ms | **4.91ms** |
| Random files | 6,263 | **7,534** | 13.11ms | 11.89ms |

**Key Improvements (Node.js vs previous):**
- config.json: **+75% RPS** (6,172 → 10,790)
- Static files: **+7% throughput** (507 → 541 MB/s)
- Memory: **Stable** (~260-340 MB)

**Conclusion:**
- Node.js now significantly faster for API endpoints (+122% vs Nginx)
- Nginx still faster for static files (+20% RPS)
- Both implementations viable depending on workload

## Options

```
-url string        Base URL to benchmark (default "http://localhost:8087")
-c int             Number of concurrent connections (default 50)
-d duration        Benchmark duration (default 30s)
-t duration        Request timeout (default 10s)
-files string      File with list of paths to request
-random            Use random files from container
-container string  Docker container name (default "dev-front-1")
-exact             Use URL exactly as provided
-monitor-memory    Monitor container memory usage
-mixed string      URL to request concurrently with files (e.g., /config.json)
-mixed-conns int   Connections dedicated to mixed URL (default 10)
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `SEND_BUFFER_SIZE` | 65536 (64KB) | Files larger than this are streamed via pipe() instead of res.end() |
| `KEEP_ALIVE_TIMEOUT` | 2 | Keep-alive timeout in seconds |
| `KEEP_ALIVE_MAX` | 100 | Max requests per keep-alive connection |
