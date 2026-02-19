# Front Service Benchmarks

This directory contains benchmarking tools and results for the front service performance testing.

## Tools

- `front-benchmark/` - Go-based HTTP load testing tool
- `run_benchmark.sh` - Automated benchmark script
- `results/` - Benchmark results storage

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

### 2026-02-18: Node.js vs Nginx+Node

| Metric | Node.js | Nginx + Node | Difference |
|--------|---------|--------------|------------|
| RPS | 6,172 | 6,362 | +3.1% |
| Latency (avg) | 6.80ms | 6.52ms | -4.1% |
| Throughput | 506.87 MB/s | 514.97 MB/s | +1.6% |

**Conclusion:** Current Node.js implementation performs within 4% of Nginx+Node hybrid.

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
