//
// Copyright © 2025-2026 Hardcore Engineering Inc.
//
// Licensed under the Eclipse Public License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License. You may
// obtain a copy of the License at https://www.eclipse.org/legal/epl-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
//
// See the License for the specific language governing permissions and
// limitations under the License.
//

package mediaconvert_test

import (
	"context"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"testing"
	"time"

	"github.com/hcengineering/stream/internal/pkg/executor"
	"github.com/hcengineering/stream/internal/pkg/log"
	"github.com/hcengineering/stream/internal/pkg/mediaconvert"
	"github.com/hcengineering/stream/internal/pkg/profile"
	"github.com/stretchr/testify/require"
)

// TestTranscodeRealMKV drives a real ffmpeg transcoding over a large mkv file
// to validate bounded memory use + successful HLS output. Opt-in via
// STREAM_TEST_MKV env var because the input file is large and slow.
//
// Usage:
//
//	STREAM_TEST_MKV="/path/to/file.mkv" STREAM_TEST_DURATION=60s \
//	    go test -run TestTranscodeRealMKV ./internal/pkg/mediaconvert/ -v -timeout=20m
func TestTranscodeRealMKV(t *testing.T) {
	src := os.Getenv("STREAM_TEST_MKV")
	if src == "" {
		t.Skip("set STREAM_TEST_MKV to enable integration test")
	}
	if _, err := os.Stat(src); err != nil { // #nosec G304,G703 -- path from env, opt-in test only
		t.Fatalf("source file not accessible: %v", err)
	}
	if _, err := exec.LookPath("ffmpeg"); err != nil {
		t.Skip("ffmpeg not in PATH")
	}

	duration := os.Getenv("STREAM_TEST_DURATION")
	if duration == "" {
		duration = "30"
	}

	outDir, err := os.MkdirTemp("", "stream-it-")
	require.NoError(t, err)
	t.Cleanup(func() { _ = os.RemoveAll(outDir) })

	uploadID := "integration-" + time.Now().Format("150405")
	require.NoError(t, os.MkdirAll(filepath.Join(outDir, uploadID), 0o755))

	// Single low-res profile, single-threaded to match the prod config defaults
	// (1 transcoding / 1 thread / 2GB RAM on 2 CPU pods).
	opts := &mediaconvert.Options{
		Input:     src,
		OutputDir: outDir,
		UploadID:  uploadID,
		LogLevel:  mediaconvert.LogLevelError,
		Threads:   1,
		Profiles: []profile.VideoProfile{
			{
				Name:       "480p",
				Height:     480,
				Scale:      true,
				VideoCodec: "libx264",
				AudioCodec: "aac",
				CRF:        28,
			},
		},
	}

	baseArgs := mediaconvert.BuildVideoCommand(opts)
	// Cap input read duration so the test is deterministic even on a 15GB source.
	// Prepending -t before -i makes it an input-side constraint (ffmpeg stops
	// reading after <duration> of decoded input), which is what we want.
	args := append([]string{"-t", duration}, baseArgs...)

	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Minute)
	defer cancel()
	ctx = log.WithFields(ctx)

	cmd := exec.CommandContext(ctx, "ffmpeg", args...) // #nosec G204,G702 -- controlled ffmpeg flags for test

	runtime.GC()
	var before runtime.MemStats
	runtime.ReadMemStats(&before)
	start := time.Now()

	err = executor.ExecuteCommands(ctx, []*exec.Cmd{cmd})
	elapsed := time.Since(start)

	runtime.GC()
	var after runtime.MemStats
	runtime.ReadMemStats(&after)

	require.NoError(t, err, "ffmpeg must complete successfully on a valid mkv")

	t.Logf("transcoding took %s", elapsed)
	t.Logf("heap inuse delta: %d bytes", int64(after.HeapInuse)-int64(before.HeapInuse))

	entries, err := os.ReadDir(filepath.Join(outDir, uploadID))
	require.NoError(t, err)
	require.NotEmpty(t, entries, "transcoder must produce HLS artifacts")

	var sawSegment, sawPlaylist bool
	for _, e := range entries {
		switch filepath.Ext(e.Name()) {
		case ".ts":
			sawSegment = true
		case ".m3u8":
			sawPlaylist = true
		}
	}
	require.True(t, sawSegment, "no .ts segments produced")
	require.True(t, sawPlaylist, "no .m3u8 playlist produced")

	// Heap growth must stay well below 256MB — the whole point of ring buffers.
	const maxHeapGrowth = 256 * 1024 * 1024
	growth := int64(after.HeapInuse) - int64(before.HeapInuse)
	require.Less(t, growth, int64(maxHeapGrowth),
		"heap growth %d exceeded cap %d", growth, maxHeapGrowth)
}
