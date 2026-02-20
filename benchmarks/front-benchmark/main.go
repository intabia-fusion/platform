/**
  Copyright © 2026 Intabia Fusion.

  Licensed under the Eclipse Public License, Version 2.0 (the "License");
  you may not use this file except in compliance with the License. You may
  obtain a copy of the License at https://www.eclipse.org/legal/epl-2.0

  Unless required by applicable law or agreed to in writing, software
  distributed under the License is distributed on an "AS IS" BASIS,
  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.

  See the License for the specific language governing permissions and
  limitations under the License.
*/

package main

import (
	"bufio"
	"context"
	"flag"
	"fmt"
	"io"
	"math/rand"
	"net/http"
	"os"
	"os/exec"
	"os/signal"
	"sort"
	"strings"
	"sync"
	"sync/atomic"
	"syscall"
	"time"

	"github.com/fatih/color"
)

// Config holds benchmark configuration
type Config struct {
	URL           string
	Connections   int
	Duration      time.Duration
	Timeout       time.Duration
	FileList      string
	RandomFiles   bool
	ContainerName string
	Exact         bool // Use URL exactly as provided, no path manipulation
	MonitorMemory bool // Monitor container memory usage
	MixedURL      string // URL for mixed workload (e.g., /config.json requested alongside random files)
	MixedConns    int    // Number of connections dedicated to mixed URL (default: 10)
}

// MemorySample holds memory usage at a point in time
type MemorySample struct {
	Timestamp time.Time
	MemoryMB  float64
}

// Stats holds aggregated benchmark statistics with atomic counters
type Stats struct {
	TotalRequests   int64
	SuccessRequests int64
	FailedRequests  int64
	TotalBytes      int64
	TotalDuration   int64
	MinLatency      int64
	MaxLatency      int64
	StatusCodes     sync.Map
	MemorySamples   []MemorySample
	MemoryMutex     sync.RWMutex
}

func main() {
	config := parseFlags()

	color.Cyan("=== Front Service Benchmark ===")
	fmt.Printf("Base URL:       %s\n", config.URL)
	fmt.Printf("Connections:    %d\n", config.Connections)
	fmt.Printf("Duration:       %s\n", config.Duration)
	fmt.Printf("Timeout:        %s\n", config.Timeout)
	fmt.Printf("Mode:           %s\n", func() string {
		if config.MixedURL != "" {
			return fmt.Sprintf("mixed (files + %s with %d conns)", config.MixedURL, config.MixedConns)
		}
		if config.Exact {
			return "exact (URL as-is)"
		}
		return "append (add files to base URL)"
	}())

	var files []string
	if config.RandomFiles {
		files = getFilesFromContainer(config.ContainerName, config.FileList)
		fmt.Printf("Files:          %d (random from container)\n", len(files))
	} else if config.FileList != "" {
		files = loadFileList(config.FileList)
		fmt.Printf("Files:          %d (from %s)\n", len(files), config.FileList)
	} else if config.Exact {
		fmt.Printf("Files:          0 (using URL directly)\n")
	} else {
		fmt.Printf("Files:          0 (using /index.html fallback)\n")
	}
	if config.MonitorMemory {
		fmt.Printf("Memory Monitor: enabled\n")
	}
	fmt.Println()

	// Setup signal handling
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	sigChan := make(chan os.Signal, 1)
	signal.Notify(sigChan, syscall.SIGINT, syscall.SIGTERM)
	go func() {
		<-sigChan
		fmt.Println("\nShutting down...")
		cancel()
	}()

	if config.MixedURL != "" {
		fileStats, mixedStats := runMixedBenchmark(ctx, config, files)
		printMixedResults(fileStats, mixedStats, config)
	} else {
		stats := runBenchmark(ctx, config, files)
		printResults(stats, config.Duration)
	}
}

func parseFlags() Config {
	url := flag.String("url", "http://huly.local:8087", "Base URL to benchmark")
	connections := flag.Int("c", 50, "Number of concurrent connections")
	duration := flag.Duration("d", 30*time.Second, "Benchmark duration")
	timeout := flag.Duration("t", 10*time.Second, "Request timeout")
	fileList := flag.String("files", "", "File with list of paths to request")
	randomFiles := flag.Bool("random", false, "Use random files from container")
	containerName := flag.String("container", "dev-front-1", "Docker container name to get files from")
	exact := flag.Bool("exact", false, "Use URL exactly as provided (no path manipulation)")
	monitorMemory := flag.Bool("monitor-memory", false, "Monitor container memory usage")
	mixedURL := flag.String("mixed", "", "URL to request concurrently with files (e.g., /config.json) for mixed workload test")
	mixedConns := flag.Int("mixed-conns", 10, "Number of connections dedicated to mixed URL")
	flag.Parse()

	return Config{
		URL:           *url,
		Connections:   *connections,
		Duration:      *duration,
		Timeout:       *timeout,
		FileList:      *fileList,
		RandomFiles:   *randomFiles,
		ContainerName: *containerName,
		Exact:         *exact,
		MonitorMemory: *monitorMemory,
		MixedURL:      *mixedURL,
		MixedConns:    *mixedConns,
	}
}

func getFilesFromContainer(containerName, fileList string) []string {
	// Check if file list already exists
	if fileList != "" {
		if _, err := os.Stat(fileList); err == nil {
			color.Yellow("Using existing file list: %s", fileList)
			return loadFileList(fileList)
		}
	}

	// Default temp file
	if fileList == "" {
		fileList = "/tmp/dist_files.txt"
	}

	color.Yellow("Extracting file list from container: %s", containerName)

	cmd := exec.Command("docker", "exec", containerName, "find", "/app/dist", "-type", "f")
	output, err := cmd.Output()
	if err != nil {
		color.Red("Failed to get files from container: %v", err)
		os.Exit(1)
	}

	// Parse and clean paths
	var files []string
	scanner := bufio.NewScanner(strings.NewReader(string(output)))
	for scanner.Scan() {
		path := scanner.Text()
		// Remove /app/dist/ prefix to get relative path
		path = strings.TrimPrefix(path, "/app/dist/")
		if path != "" {
			files = append(files, path)
		}
	}

	// Save to file
	f, err := os.Create(fileList)
	if err != nil {
		color.Red("Failed to save file list: %v", err)
	} else {
		defer f.Close()
		for _, file := range files {
			fmt.Fprintln(f, file)
		}
		color.Green("Saved %d files to %s", len(files), fileList)
	}

	return files
}

func loadFileList(filename string) []string {
	file, err := os.Open(filename)
	if err != nil {
		color.Red("Failed to open file list: %v", err)
		os.Exit(1)
	}
	defer file.Close()

	var files []string
	scanner := bufio.NewScanner(file)
	for scanner.Scan() {
		path := strings.TrimSpace(scanner.Text())
		if path != "" {
			files = append(files, path)
		}
	}

	if err := scanner.Err(); err != nil {
		color.Red("Error reading file list: %v", err)
		os.Exit(1)
	}

	return files
}

// monitorMemory tracks container memory usage during benchmark
func monitorMemory(ctx context.Context, containerName string, stats *Stats) {
	ticker := time.NewTicker(2 * time.Second)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			mem := getContainerMemory(containerName)
			if mem > 0 {
				stats.MemoryMutex.Lock()
				stats.MemorySamples = append(stats.MemorySamples, MemorySample{
					Timestamp: time.Now(),
					MemoryMB:  mem,
				})
				stats.MemoryMutex.Unlock()
			}
		}
	}
}

// getContainerMemory returns container memory usage in MB
func getContainerMemory(containerName string) float64 {
	// Use docker stats to get memory usage
	cmd := exec.Command("docker", "stats", containerName, "--no-stream", "--format", "{{.MemUsage}}")
	output, err := cmd.Output()
	if err != nil {
		return 0
	}

	// Parse output like "45.2MiB / 100MiB"
	parts := strings.Fields(string(output))
	if len(parts) < 1 {
		return 0
	}

	// Extract numeric value and unit
	memStr := parts[0]
	var mem float64
	var unit string

	// Parse number and unit
	for i, c := range memStr {
		if (c >= '0' && c <= '9') || c == '.' {
			continue
		}
		memStr, unit = memStr[:i], memStr[i:]
		break
	}

	fmt.Sscanf(memStr, "%f", &mem)

	// Convert to MB
	switch strings.ToLower(unit) {
	case "b":
		mem = mem / 1024 / 1024
	case "kib":
		mem = mem / 1024
	case "mib":
		// Already in MB
	case "gib":
		mem = mem * 1024
	case "kb":
		mem = mem / 1000
	case "mb":
		// Already in MB
	case "gb":
		mem = mem * 1000
	}

	return mem
}

func runBenchmark(ctx context.Context, config Config, files []string) *Stats {
	stats := &Stats{
		MinLatency: 1<<63 - 1,
	}

	// Create benchmark context with timeout
	benchCtx, cancel := context.WithTimeout(ctx, config.Duration)
	defer cancel()

	// Create shared HTTP client with connection pool
	client := &http.Client{
		Timeout: config.Timeout,
		Transport: &http.Transport{
			MaxIdleConns:        config.Connections * 2,
			MaxIdleConnsPerHost: config.Connections * 2,
			IdleConnTimeout:     90 * time.Second,
			DisableCompression:  false,
			ForceAttemptHTTP2:   false,
		},
	}

	// Start progress reporter
	done := make(chan struct{})
	go func() {
		ticker := time.NewTicker(time.Second)
		defer ticker.Stop()
		count := 0
		for {
			select {
			case <-ticker.C:
				count++
				total := atomic.LoadInt64(&stats.TotalRequests)
				fmt.Printf("\rProgress: %d/%d seconds | Requests: %d", count, int(config.Duration.Seconds()), total)
			case <-done:
				fmt.Println()
				return
			case <-benchCtx.Done():
				return
			}
		}
	}()

	// Start memory monitor if container name provided
	if config.MonitorMemory && config.ContainerName != "" {
		go monitorMemory(benchCtx, config.ContainerName, stats)
	}

	// Pre-seed random
	rand.Seed(time.Now().UnixNano())

	// Start workers
	var wg sync.WaitGroup
	for i := 0; i < config.Connections; i++ {
		wg.Add(1)
		go worker(benchCtx, config, files, stats, &wg, client)
	}

	// Wait for completion
	<-benchCtx.Done()
	wg.Wait()
	close(done)

	return stats
}

// runMixedBenchmark runs two groups of workers concurrently:
// - fileWorkers: request random files from the file list
// - mixedWorkers: request the mixed URL (e.g., /config.json)
// Returns separate stats for each group.
func runMixedBenchmark(ctx context.Context, config Config, files []string) (*Stats, *Stats) {
	fileStats := &Stats{MinLatency: 1<<63 - 1}
	mixedStats := &Stats{MinLatency: 1<<63 - 1}

	benchCtx, cancel := context.WithTimeout(ctx, config.Duration)
	defer cancel()

	totalConns := config.Connections + config.MixedConns

	client := &http.Client{
		Timeout: config.Timeout,
		Transport: &http.Transport{
			MaxIdleConns:        totalConns * 2,
			MaxIdleConnsPerHost: totalConns * 2,
			IdleConnTimeout:     90 * time.Second,
			DisableCompression:  false,
			ForceAttemptHTTP2:   false,
		},
	}

	// Progress reporter showing both stats
	done := make(chan struct{})
	go func() {
		ticker := time.NewTicker(time.Second)
		defer ticker.Stop()
		count := 0
		for {
			select {
			case <-ticker.C:
				count++
				fileTotal := atomic.LoadInt64(&fileStats.TotalRequests)
				mixedTotal := atomic.LoadInt64(&mixedStats.TotalRequests)
				fmt.Printf("\rProgress: %d/%ds | Files: %d | Mixed: %d",
					count, int(config.Duration.Seconds()), fileTotal, mixedTotal)
			case <-done:
				fmt.Println()
				return
			case <-benchCtx.Done():
				return
			}
		}
	}()

	// Memory monitor uses fileStats for storage (shared resource)
	if config.MonitorMemory && config.ContainerName != "" {
		go monitorMemory(benchCtx, config.ContainerName, fileStats)
	}

	rand.Seed(time.Now().UnixNano())

	var wg sync.WaitGroup

	// File workers
	for i := 0; i < config.Connections; i++ {
		wg.Add(1)
		go worker(benchCtx, config, files, fileStats, &wg, client)
	}

	// Mixed URL workers (e.g., config.json)
	baseURL := strings.TrimSuffix(config.URL, "/")
	mixedFullURL := baseURL + config.MixedURL
	for i := 0; i < config.MixedConns; i++ {
		wg.Add(1)
		go mixedWorker(benchCtx, mixedFullURL, mixedStats, &wg, client)
	}

	<-benchCtx.Done()
	wg.Wait()
	close(done)

	return fileStats, mixedStats
}

// mixedWorker continuously requests a single URL and records stats
func mixedWorker(ctx context.Context, url string, stats *Stats, wg *sync.WaitGroup, client *http.Client) {
	defer wg.Done()

	for {
		select {
		case <-ctx.Done():
			return
		default:
			doRequestAndRecord(client, url, 10*time.Second, stats)
		}
	}
}

func worker(ctx context.Context, config Config, files []string, stats *Stats, wg *sync.WaitGroup, client *http.Client) {
	defer wg.Done()

	for {
		select {
		case <-ctx.Done():
			return
		default:
			var url string
			if config.Exact {
				// Use URL exactly as provided - no path manipulation
				url = config.URL
			} else if len(files) > 0 {
				// Random file from list - append to base URL
				file := files[rand.Intn(len(files))]
				baseURL := strings.TrimSuffix(config.URL, "/")
				// If URL already has a path (e.g., /config.json), use it as base
				// Otherwise append file to base URL
				url = fmt.Sprintf("%s/%s", baseURL, file)
			} else {
				// Fallback to index.html, but only if URL doesn't already have a file path
				baseURL := strings.TrimSuffix(config.URL, "/")
				// Check if URL already has a file extension (like .json, .html, etc.)
				if strings.Contains(baseURL, ".") {
					url = baseURL
				} else {
					url = fmt.Sprintf("%s/index.html", baseURL)
				}
			}

			doRequestAndRecord(client, url, config.Timeout, stats)
		}
	}
}

func doRequestAndRecord(client *http.Client, url string, timeout time.Duration, stats *Stats) {
	start := time.Now()
	req, err := http.NewRequest("GET", url, nil)
	if err != nil {
		atomic.AddInt64(&stats.TotalRequests, 1)
		atomic.AddInt64(&stats.FailedRequests, 1)
		return
	}

	resp, err := client.Do(req)
	duration := time.Since(start)
	durationMs := duration.Milliseconds()

	atomic.AddInt64(&stats.TotalRequests, 1)
	atomic.AddInt64(&stats.TotalDuration, durationMs)

	if err != nil {
		atomic.AddInt64(&stats.FailedRequests, 1)
		return
	}
	defer resp.Body.Close()

	// Read body to ensure complete response
	bytesRead, _ := io.Copy(io.Discard, resp.Body)
	atomic.AddInt64(&stats.TotalBytes, bytesRead)

	// Update status codes
	if count, loaded := stats.StatusCodes.LoadOrStore(resp.StatusCode, int64(1)); loaded {
		stats.StatusCodes.Store(resp.StatusCode, count.(int64)+1)
	}

	if resp.StatusCode == http.StatusOK {
		atomic.AddInt64(&stats.SuccessRequests, 1)
	} else {
		atomic.AddInt64(&stats.FailedRequests, 1)
	}

	// Update min/max latency
	for {
		min := atomic.LoadInt64(&stats.MinLatency)
		if durationMs >= min || atomic.CompareAndSwapInt64(&stats.MinLatency, min, durationMs) {
			break
		}
	}
	for {
		max := atomic.LoadInt64(&stats.MaxLatency)
		if durationMs <= max || atomic.CompareAndSwapInt64(&stats.MaxLatency, max, durationMs) {
			break
		}
	}
}

func printResults(stats *Stats, duration time.Duration) {
	if stats.TotalRequests == 0 {
		color.Red("No requests completed")
		return
	}

	totalDuration := time.Duration(atomic.LoadInt64(&stats.TotalDuration)) * time.Millisecond
	avgLatency := totalDuration / time.Duration(stats.TotalRequests)
	rps := float64(stats.TotalRequests) / duration.Seconds()
	throughput := float64(stats.TotalBytes) / duration.Seconds() / 1024 / 1024 // MB/s

	color.Green("\n=== Benchmark Results ===")
	fmt.Println()

	color.Yellow("Requests:")
	fmt.Printf("  Total:      %d\n", stats.TotalRequests)
	fmt.Printf("  Successful: %d (%.2f%%)\n", stats.SuccessRequests, float64(stats.SuccessRequests)/float64(stats.TotalRequests)*100)
	fmt.Printf("  Failed:     %d (%.2f%%)\n", stats.FailedRequests, float64(stats.FailedRequests)/float64(stats.TotalRequests)*100)
	fmt.Printf("  RPS:        %.2f\n", rps)
	fmt.Println()

	color.Yellow("Latency:")
	fmt.Printf("  Min:    %s\n", time.Duration(atomic.LoadInt64(&stats.MinLatency))*time.Millisecond)
	fmt.Printf("  Max:    %s\n", time.Duration(atomic.LoadInt64(&stats.MaxLatency))*time.Millisecond)
	fmt.Printf("  Avg:    %s\n", avgLatency)
	fmt.Println()

	color.Yellow("Throughput:")
	fmt.Printf("  Total: %.2f MB\n", float64(stats.TotalBytes)/1024/1024)
	fmt.Printf("  Rate:  %.2f MB/s\n", throughput)
	fmt.Println()

	color.Yellow("Status Codes:")
	printStatusCodes(stats)

	printMemoryStats(stats)

	// Exit with error code if there were failures
	if stats.FailedRequests > 0 {
		fmt.Println()
		color.Red("WARNING: Some requests failed!")
		os.Exit(1)
	}
}

func printMixedResults(fileStats *Stats, mixedStats *Stats, config Config) {
	duration := config.Duration

	color.Green("\n=== Mixed Workload Benchmark Results ===")

	// --- File workers ---
	fmt.Println()
	color.Cyan("--- File Workers (%d connections) ---", config.Connections)
	if fileStats.TotalRequests > 0 {
		totalDuration := time.Duration(atomic.LoadInt64(&fileStats.TotalDuration)) * time.Millisecond
		avgLatency := totalDuration / time.Duration(fileStats.TotalRequests)
		rps := float64(fileStats.TotalRequests) / duration.Seconds()
		throughput := float64(fileStats.TotalBytes) / duration.Seconds() / 1024 / 1024

		color.Yellow("Requests:")
		fmt.Printf("  Total:      %d\n", fileStats.TotalRequests)
		fmt.Printf("  Successful: %d (%.2f%%)\n", fileStats.SuccessRequests, float64(fileStats.SuccessRequests)/float64(fileStats.TotalRequests)*100)
		fmt.Printf("  Failed:     %d (%.2f%%)\n", fileStats.FailedRequests, float64(fileStats.FailedRequests)/float64(fileStats.TotalRequests)*100)
		fmt.Printf("  RPS:        %.2f\n", rps)

		color.Yellow("Latency:")
		fmt.Printf("  Min:    %s\n", time.Duration(atomic.LoadInt64(&fileStats.MinLatency))*time.Millisecond)
		fmt.Printf("  Max:    %s\n", time.Duration(atomic.LoadInt64(&fileStats.MaxLatency))*time.Millisecond)
		fmt.Printf("  Avg:    %s\n", avgLatency)

		color.Yellow("Throughput:")
		fmt.Printf("  Total: %.2f MB\n", float64(fileStats.TotalBytes)/1024/1024)
		fmt.Printf("  Rate:  %.2f MB/s\n", throughput)

		color.Yellow("Status Codes:")
		printStatusCodes(fileStats)
	}

	// --- Mixed URL workers ---
	fmt.Println()
	color.Cyan("--- Mixed URL Workers: %s (%d connections) ---", config.MixedURL, config.MixedConns)
	if mixedStats.TotalRequests > 0 {
		totalDuration := time.Duration(atomic.LoadInt64(&mixedStats.TotalDuration)) * time.Millisecond
		avgLatency := totalDuration / time.Duration(mixedStats.TotalRequests)
		rps := float64(mixedStats.TotalRequests) / duration.Seconds()
		throughput := float64(mixedStats.TotalBytes) / duration.Seconds() / 1024 / 1024

		color.Yellow("Requests:")
		fmt.Printf("  Total:      %d\n", mixedStats.TotalRequests)
		fmt.Printf("  Successful: %d (%.2f%%)\n", mixedStats.SuccessRequests, float64(mixedStats.SuccessRequests)/float64(mixedStats.TotalRequests)*100)
		fmt.Printf("  Failed:     %d (%.2f%%)\n", mixedStats.FailedRequests, float64(mixedStats.FailedRequests)/float64(mixedStats.TotalRequests)*100)
		fmt.Printf("  RPS:        %.2f\n", rps)

		color.Yellow("Latency:")
		fmt.Printf("  Min:    %s\n", time.Duration(atomic.LoadInt64(&mixedStats.MinLatency))*time.Millisecond)
		fmt.Printf("  Max:    %s\n", time.Duration(atomic.LoadInt64(&mixedStats.MaxLatency))*time.Millisecond)
		fmt.Printf("  Avg:    %s\n", avgLatency)

		color.Yellow("Throughput:")
		fmt.Printf("  Total: %.2f MB\n", float64(mixedStats.TotalBytes)/1024/1024)
		fmt.Printf("  Rate:  %.2f MB/s\n", throughput)

		color.Yellow("Status Codes:")
		printStatusCodes(mixedStats)
	}

	// --- Memory (stored in fileStats) ---
	printMemoryStats(fileStats)

	// Check failures
	totalFailed := fileStats.FailedRequests + mixedStats.FailedRequests
	if totalFailed > 0 {
		fmt.Println()
		color.Red("WARNING: Some requests failed!")
		os.Exit(1)
	}
}

func printStatusCodes(stats *Stats) {
	var codes []int
	stats.StatusCodes.Range(func(key, value interface{}) bool {
		codes = append(codes, key.(int))
		return true
	})
	sort.Ints(codes)
	for _, code := range codes {
		count, _ := stats.StatusCodes.Load(code)
		fmt.Printf("  %d: %d (%.2f%%)\n", code, count.(int64), float64(count.(int64))/float64(stats.TotalRequests)*100)
	}
}

func printMemoryStats(stats *Stats) {
	stats.MemoryMutex.RLock()
	defer stats.MemoryMutex.RUnlock()

	if len(stats.MemorySamples) > 0 {
		fmt.Println()
		color.Yellow("Memory Usage:")

		var minMem, maxMem float64
		minMem = stats.MemorySamples[0].MemoryMB
		maxMem = stats.MemorySamples[0].MemoryMB
		var totalMem float64

		for _, sample := range stats.MemorySamples {
			if sample.MemoryMB < minMem {
				minMem = sample.MemoryMB
			}
			if sample.MemoryMB > maxMem {
				maxMem = sample.MemoryMB
			}
			totalMem += sample.MemoryMB
		}
		avgMem := totalMem / float64(len(stats.MemorySamples))

		fmt.Printf("  Samples: %d\n", len(stats.MemorySamples))
		fmt.Printf("  Min:     %.2f MB\n", minMem)
		fmt.Printf("  Max:     %.2f MB\n", maxMem)
		fmt.Printf("  Avg:     %.2f MB\n", avgMem)
		if len(stats.MemorySamples) > 1 {
			fmt.Printf("  Start:   %.2f MB\n", stats.MemorySamples[0].MemoryMB)
			fmt.Printf("  End:     %.2f MB\n", stats.MemorySamples[len(stats.MemorySamples)-1].MemoryMB)
		}
	}
}
