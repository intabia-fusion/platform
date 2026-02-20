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
-url string       Base URL to benchmark (default "http://localhost:8087")
-c int           Number of concurrent connections (default 50)
-d duration      Benchmark duration (default 30s)
-t duration      Request timeout (default 10s)
-files string    File with list of paths to request
-random          Use random files from container
-container string Docker container name (default "dev-front-1")
-exact           Use URL exactly as provided
```
