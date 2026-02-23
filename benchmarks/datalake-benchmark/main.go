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
	"bytes"
	"context"
	"crypto/rand"
	"encoding/json"
	"flag"
	"fmt"
	"io"
	mathrand "math/rand"
	"mime/multipart"
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
	"github.com/golang-jwt/jwt/v5"
)

// Config holds benchmark configuration
type Config struct {
	URL           string
	Connections   int
	Duration      time.Duration
	Timeout       time.Duration
	Secret        string
	Workspace     string
	Account       string
	BlobCount     int           // Number of test blobs to upload
	BlobSizes     []int         // Sizes of test blobs in bytes
	ContainerName string
	MonitorMemory bool
	SkipUpload    bool   // Skip upload phase, use existing blobs
	BlobListFile  string // File with blob names to use
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

// UploadResult represents the response from datalake upload
type UploadResult struct {
	Key      string         `json:"key"`
	ID       string         `json:"id"`
	Metadata *BlobMetadata  `json:"metadata,omitempty"`
	Error    string         `json:"error,omitempty"`
}

type BlobMetadata struct {
	Name         string `json:"name"`
	ETag         string `json:"etag"`
	Size         int64  `json:"size"`
	ContentType  string `json:"contentType"`
	LastModified int64  `json:"lastModified"`
}

func main() {
	config := parseFlags()

	color.Cyan("=== Datalake Benchmark ===")
	fmt.Printf("Base URL:       %s\n", config.URL)
	fmt.Printf("Connections:    %d\n", config.Connections)
	fmt.Printf("Duration:       %s\n", config.Duration)
	fmt.Printf("Timeout:        %s\n", config.Timeout)
	fmt.Printf("Workspace:      %s\n", config.Workspace)
	fmt.Printf("Blob count:     %d\n", config.BlobCount)
	fmt.Printf("Blob sizes:     %v bytes\n", config.BlobSizes)
	if config.MonitorMemory {
		fmt.Printf("Memory Monitor: enabled (container: %s)\n", config.ContainerName)
	}
	fmt.Println()

	// Generate JWT token
	token, err := generateJWT(config.Account, config.Workspace, config.Secret)
	if err != nil {
		color.Red("Failed to generate JWT token: %v", err)
		os.Exit(1)
	}
	color.Green("Generated JWT token")

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

	// Get or upload blob names
	var blobNames []string
	if config.BlobListFile != "" {
		blobNames = loadBlobList(config.BlobListFile)
		color.Green("Loaded %d blob names from %s", len(blobNames), config.BlobListFile)
	} else if config.SkipUpload {
		color.Yellow("Skip upload mode: fetching blob list from datalake...")
		blobNames = listBlobs(config.URL, config.Workspace, token, config.Timeout)
		if len(blobNames) == 0 {
			color.Red("No blobs found in workspace %s. Run without -skip-upload first.", config.Workspace)
			os.Exit(1)
		}
		color.Green("Found %d existing blobs", len(blobNames))
	} else {
		// Upload test blobs
		color.Yellow("Uploading %d test blobs...", config.BlobCount)
		blobNames = uploadTestBlobs(ctx, config, token)
		if len(blobNames) == 0 {
			color.Red("No blobs uploaded successfully")
			os.Exit(1)
		}
		color.Green("Uploaded %d test blobs", len(blobNames))

		// Save blob list for reuse
		saveBlobList(blobNames, "/tmp/datalake_blobs.txt")
	}

	fmt.Println()
	color.Cyan("Starting download benchmark...")
	fmt.Println()

	// Run download benchmark
	stats := runBenchmark(ctx, config, token, blobNames)
	printResults(stats, config.Duration)
}

func parseFlags() Config {
	url := flag.String("url", "http://huly.local:4030", "Datalake base URL")
	connections := flag.Int("c", 50, "Number of concurrent connections")
	duration := flag.Duration("d", 30*time.Second, "Benchmark duration")
	timeout := flag.Duration("t", 10*time.Second, "Request timeout")
	secret := flag.String("secret", "secret", "JWT secret for token generation")
	workspace := flag.String("workspace", "00000000-0000-0000-0000-000000000000", "Workspace UUID")
	account := flag.String("account", "00000000-0000-0000-0000-000000000001", "Account UUID")
	blobCount := flag.Int("blobs", 20, "Number of test blobs to upload")
	blobSizesStr := flag.String("blob-sizes", "1024,10240,102400,1048576", "Comma-separated blob sizes in bytes")
	containerName := flag.String("container", "dev-datalake-1", "Docker container name for memory monitoring")
	monitorMemory := flag.Bool("monitor-memory", false, "Monitor container memory usage")
	skipUpload := flag.Bool("skip-upload", false, "Skip upload phase, use existing blobs")
	blobListFile := flag.String("blob-list", "", "File with blob names to benchmark (one per line)")
	flag.Parse()

	// Parse blob sizes
	var blobSizes []int
	for _, s := range strings.Split(*blobSizesStr, ",") {
		s = strings.TrimSpace(s)
		var size int
		fmt.Sscanf(s, "%d", &size)
		if size > 0 {
			blobSizes = append(blobSizes, size)
		}
	}
	if len(blobSizes) == 0 {
		blobSizes = []int{1024, 10240, 102400}
	}

	return Config{
		URL:           *url,
		Connections:   *connections,
		Duration:      *duration,
		Timeout:       *timeout,
		Secret:        *secret,
		Workspace:     *workspace,
		Account:       *account,
		BlobCount:     *blobCount,
		BlobSizes:     blobSizes,
		ContainerName: *containerName,
		MonitorMemory: *monitorMemory,
		SkipUpload:    *skipUpload,
		BlobListFile:  *blobListFile,
	}
}

// generateJWT creates a JWT token compatible with huly's jwt-simple (HS256)
func generateJWT(account, workspace, secret string) (string, error) {
	claims := jwt.MapClaims{
		"account":   account,
		"workspace": workspace,
	}
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return token.SignedString([]byte(secret))
}

// uploadTestBlobs uploads test blobs of various sizes and returns their names
func uploadTestBlobs(ctx context.Context, config Config, token string) []string {
	client := &http.Client{Timeout: 30 * time.Second}
	var blobNames []string

	for i := 0; i < config.BlobCount; i++ {
		select {
		case <-ctx.Done():
			return blobNames
		default:
		}

		// Pick a random size from configured sizes
		size := config.BlobSizes[i%len(config.BlobSizes)]
		blobName := fmt.Sprintf("bench-blob-%d-%d", size, i)

		// Generate random data
		data := make([]byte, size)
		rand.Read(data)

		// Upload via form-data
		name, err := uploadBlob(client, config.URL, config.Workspace, token, blobName, data)
		if err != nil {
			color.Red("  Failed to upload blob %s: %v", blobName, err)
			continue
		}

		blobNames = append(blobNames, name)
		fmt.Printf("  Uploaded: %s (%d bytes)\n", name, size)
	}

	return blobNames
}

// uploadBlob uploads a single blob via form-data to datalake
func uploadBlob(client *http.Client, baseURL, workspace, token, name string, data []byte) (string, error) {
	var buf bytes.Buffer
	writer := multipart.NewWriter(&buf)

	part, err := writer.CreateFormFile("file", name)
	if err != nil {
		return "", fmt.Errorf("create form file: %w", err)
	}

	if _, err := part.Write(data); err != nil {
		return "", fmt.Errorf("write data: %w", err)
	}

	if err := writer.Close(); err != nil {
		return "", fmt.Errorf("close writer: %w", err)
	}

	url := fmt.Sprintf("%s/upload/form-data/%s", strings.TrimSuffix(baseURL, "/"), workspace)
	req, err := http.NewRequest("POST", url, &buf)
	if err != nil {
		return "", fmt.Errorf("create request: %w", err)
	}

	req.Header.Set("Content-Type", writer.FormDataContentType())
	req.Header.Set("Authorization", "Bearer "+token)

	resp, err := client.Do(req)
	if err != nil {
		return "", fmt.Errorf("do request: %w", err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return "", fmt.Errorf("read response: %w", err)
	}

	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("upload failed with status %d: %s", resp.StatusCode, string(body))
	}

	var results []UploadResult
	if err := json.Unmarshal(body, &results); err != nil {
		return "", fmt.Errorf("parse response: %w", err)
	}

	if len(results) == 0 {
		return "", fmt.Errorf("empty upload result")
	}

	if results[0].Error != "" {
		return "", fmt.Errorf("upload error: %s", results[0].Error)
	}

	return results[0].ID, nil
}

// listBlobs fetches blob names from datalake (requires admin token)
func listBlobs(baseURL, workspace, token string, timeout time.Duration) []string {
	// This endpoint requires admin authorization, so we just return empty
	// and let the user use -blob-list or upload first
	return nil
}

func loadBlobList(filename string) []string {
	data, err := os.ReadFile(filename)
	if err != nil {
		color.Red("Failed to read blob list: %v", err)
		os.Exit(1)
	}

	var names []string
	for _, line := range strings.Split(string(data), "\n") {
		line = strings.TrimSpace(line)
		if line != "" {
			names = append(names, line)
		}
	}
	return names
}

func saveBlobList(names []string, filename string) {
	data := strings.Join(names, "\n") + "\n"
	if err := os.WriteFile(filename, []byte(data), 0644); err != nil {
		color.Yellow("Warning: could not save blob list: %v", err)
	} else {
		color.Green("Saved blob list to %s", filename)
	}
}

func runBenchmark(ctx context.Context, config Config, token string, blobNames []string) *Stats {
	stats := &Stats{
		MinLatency: 1<<63 - 1,
	}

	benchCtx, cancel := context.WithTimeout(ctx, config.Duration)
	defer cancel()

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
				success := atomic.LoadInt64(&stats.SuccessRequests)
				failed := atomic.LoadInt64(&stats.FailedRequests)
				bytes := atomic.LoadInt64(&stats.TotalBytes)
				fmt.Printf("\rProgress: %d/%ds | Requests: %d (ok:%d fail:%d) | %.2f MB",
					count, int(config.Duration.Seconds()), total, success, failed,
					float64(bytes)/1024/1024)
			case <-done:
				fmt.Println()
				return
			case <-benchCtx.Done():
				return
			}
		}
	}()

	// Start memory monitor
	if config.MonitorMemory && config.ContainerName != "" {
		go monitorMemory(benchCtx, config.ContainerName, stats)
	}

	// Start workers
	var wg sync.WaitGroup
	for i := 0; i < config.Connections; i++ {
		wg.Add(1)
		go downloadWorker(benchCtx, config, token, blobNames, stats, &wg, client)
	}

	<-benchCtx.Done()
	wg.Wait()
	close(done)

	return stats
}

func downloadWorker(ctx context.Context, config Config, token string, blobNames []string, stats *Stats, wg *sync.WaitGroup, client *http.Client) {
	defer wg.Done()

	baseURL := strings.TrimSuffix(config.URL, "/")

	for {
		select {
		case <-ctx.Done():
			return
		default:
			// Pick random blob
			blobName := blobNames[mathrand.Intn(len(blobNames))]
			url := fmt.Sprintf("%s/blob/%s/%s", baseURL, config.Workspace, blobName)

			doRequestAndRecord(client, url, token, stats)
		}
	}
}

func doRequestAndRecord(client *http.Client, url, token string, stats *Stats) {
	start := time.Now()
	req, err := http.NewRequest("GET", url, nil)
	if err != nil {
		atomic.AddInt64(&stats.TotalRequests, 1)
		atomic.AddInt64(&stats.FailedRequests, 1)
		return
	}

	// Add auth token (datalake may or may not require it depending on SECURE mode)
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
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

func getContainerMemory(containerName string) float64 {
	cmd := exec.Command("docker", "stats", containerName, "--no-stream", "--format", "{{.MemUsage}}")
	output, err := cmd.Output()
	if err != nil {
		return 0
	}

	parts := strings.Fields(string(output))
	if len(parts) < 1 {
		return 0
	}

	memStr := parts[0]
	var mem float64
	var unit string

	for i, c := range memStr {
		if (c >= '0' && c <= '9') || c == '.' {
			continue
		}
		memStr, unit = memStr[:i], memStr[i:]
		break
	}

	fmt.Sscanf(memStr, "%f", &mem)

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

func printResults(stats *Stats, duration time.Duration) {
	if stats.TotalRequests == 0 {
		color.Red("No requests completed")
		return
	}

	totalDuration := time.Duration(atomic.LoadInt64(&stats.TotalDuration)) * time.Millisecond
	avgLatency := totalDuration / time.Duration(stats.TotalRequests)
	rps := float64(stats.TotalRequests) / duration.Seconds()
	throughput := float64(stats.TotalBytes) / duration.Seconds() / 1024 / 1024

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

	// Print memory statistics if available
	stats.MemoryMutex.RLock()
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
	stats.MemoryMutex.RUnlock()

	if stats.FailedRequests > 0 {
		fmt.Println()
		color.Red("WARNING: Some requests failed!")
		os.Exit(1)
	}
}
