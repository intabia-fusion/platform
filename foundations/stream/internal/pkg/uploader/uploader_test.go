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

package uploader_test

import (
	"context"
	"os"
	"path/filepath"
	"runtime"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/hcengineering/stream/internal/pkg/log"
	"github.com/hcengineering/stream/internal/pkg/storage"
	"github.com/hcengineering/stream/internal/pkg/uploader"
	"github.com/pkg/errors"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

const osLinux = "linux"

// fakeStorage is a thread-safe in-memory storage.Storage implementation for
// testing the uploader without hitting the network.
type fakeStorage struct {
	mu           sync.Mutex
	puts         map[string]int // filename -> attempt count
	deletes      map[string]int
	parents      map[string]string
	failPutUntil int32 // fail the first N PutFile calls with a transient error
	failPutAll   bool
	putDelay     time.Duration
	putCount     int32
}

func newFakeStorage() *fakeStorage {
	return &fakeStorage{
		puts:    map[string]int{},
		deletes: map[string]int{},
		parents: map[string]string{},
	}
}

func (f *fakeStorage) PutFile(ctx context.Context, name string, _ storage.PutOptions) error {
	atomic.AddInt32(&f.putCount, 1)
	if f.putDelay > 0 {
		select {
		case <-time.After(f.putDelay):
		case <-ctx.Done():
			return ctx.Err()
		}
	}
	f.mu.Lock()
	defer f.mu.Unlock()
	f.puts[name]++
	if f.failPutAll {
		return errors.New("transient")
	}
	if atomic.LoadInt32(&f.failPutUntil) > 0 {
		atomic.AddInt32(&f.failPutUntil, -1)
		return errors.New("transient")
	}
	return nil
}

func (f *fakeStorage) DeleteFile(_ context.Context, name string) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.deletes[name]++
	return nil
}

func (f *fakeStorage) GetFile(_ context.Context, _, _ string) error { return nil }

func (f *fakeStorage) StatFile(_ context.Context, _ string) (*storage.BlobInfo, error) {
	return &storage.BlobInfo{}, nil
}

func (f *fakeStorage) SetParent(_ context.Context, name, parent string) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.parents[name] = parent
	return nil
}

func (f *fakeStorage) putAttempts(name string) int {
	f.mu.Lock()
	defer f.mu.Unlock()
	return f.puts[name]
}

func (f *fakeStorage) distinctUploads() int {
	f.mu.Lock()
	defer f.mu.Unlock()
	return len(f.puts)
}

func (f *fakeStorage) deleteCount() int {
	f.mu.Lock()
	defer f.mu.Unlock()
	return len(f.deletes)
}

func writeFile(t *testing.T, dir, name, content string) {
	t.Helper()
	p := filepath.Join(dir, name)
	require.NoError(t, os.WriteFile(p, []byte(content), 0o600))
}

func newUploader(t *testing.T, fs storage.Storage, dir string, opts uploader.Options) uploader.Uploader {
	t.Helper()
	if opts.Dir == "" {
		opts.Dir = dir
	}
	if opts.BufferSize == 0 {
		opts.BufferSize = 16
	}
	if opts.WorkerCount == 0 {
		opts.WorkerCount = 2
	}
	if opts.Timeout == 0 {
		opts.Timeout = 2 * time.Second
	}
	if opts.RetryCount == 0 {
		opts.RetryCount = 3
	}
	ctx := log.WithFields(context.Background())
	return uploader.New(ctx, fs, opts)
}

// TestUploader_HappyPath_PreExistingFiles verifies that files already present
// in the directory when Start() is invoked are picked up by scanFiles and
// uploaded exactly once.
func TestUploader_HappyPath_PreExistingFiles(t *testing.T) {
	if runtime.GOOS != osLinux {
		t.Skip("uploader relies on inotify; only Linux runs the full workflow")
	}

	dir := t.TempDir()
	writeFile(t, dir, "segment_000.ts", "a")
	writeFile(t, dir, "segment_001.ts", "b")
	writeFile(t, dir, "playlist.m3u8", "c")

	fs := newFakeStorage()
	up := newUploader(t, fs, dir, uploader.Options{})

	up.Start()
	require.Eventually(t, func() bool {
		return fs.distinctUploads() == 3
	}, 2*time.Second, 10*time.Millisecond, "workers must drain pre-existing files")
	up.Stop()

	assert.Equal(t, 3, fs.distinctUploads(), "every file must be uploaded once")
	assert.Equal(t, 1, fs.putAttempts(filepath.Join(dir, "segment_000.ts")))
}

// TestUploader_RetriesTransientErrors verifies that PutFile is retried and
// eventually succeeds for a file that fails a couple of times transiently.
func TestUploader_RetriesTransientErrors(t *testing.T) {
	if runtime.GOOS != osLinux {
		t.Skip("uploader relies on inotify")
	}

	dir := t.TempDir()
	writeFile(t, dir, "segment_000.ts", "a")

	fs := newFakeStorage()
	atomic.StoreInt32(&fs.failPutUntil, 2) // fail first 2 attempts

	up := newUploader(t, fs, dir, uploader.Options{
		RetryCount: 5,
		RetryDelay: 10 * time.Millisecond,
	})

	up.Start()
	target := filepath.Join(dir, "segment_000.ts")
	require.Eventually(t, func() bool {
		return fs.putAttempts(target) >= 3
	}, 2*time.Second, 10*time.Millisecond, "file must be retried until success")
	up.Stop()

	assert.Equal(t, 3, fs.putAttempts(target),
		"file must be retried until success")
}

// TestUploader_GivesUpAfterRetryCount verifies that each pass through the
// worker pipeline stops hammering storage after RetryCount attempts.
//
// Note: Stop() performs a final scan of the directory; any file that never
// made it to sentFiles will be re-enqueued and retried another RetryCount
// times. The assertion therefore accepts the total to be a multiple of
// RetryCount, not exactly RetryCount.
func TestUploader_GivesUpAfterRetryCount(t *testing.T) {
	if runtime.GOOS != osLinux {
		t.Skip("uploader relies on inotify")
	}

	dir := t.TempDir()
	writeFile(t, dir, "segment_000.ts", "a")

	fs := newFakeStorage()
	fs.failPutAll = true

	const retryCount = 3
	up := newUploader(t, fs, dir, uploader.Options{
		RetryCount: retryCount,
		RetryDelay: 5 * time.Millisecond,
	})

	up.Start()
	target := filepath.Join(dir, "segment_000.ts")
	// Wait until the uploader exhausts its first retry pass. RetryCount attempts
	// with 5ms delay ~= 15ms; poll until we see retryCount attempts.
	require.Eventually(t, func() bool {
		return fs.putAttempts(target) >= retryCount
	}, 2*time.Second, 5*time.Millisecond, "uploader must attempt RetryCount times")
	up.Stop()

	attempts := fs.putAttempts(target)
	assert.Equal(t, 0, attempts%retryCount,
		"attempts (%d) must be a multiple of RetryCount", attempts)
	assert.LessOrEqual(t, attempts, 2*retryCount,
		"uploader must not retry indefinitely")
}

// TestUploader_Cancel_RollsBackUploaded verifies that Cancel triggers
// DeleteFile for already-uploaded files (rollback semantics).
func TestUploader_Cancel_RollsBackUploaded(t *testing.T) {
	if runtime.GOOS != osLinux {
		t.Skip("uploader relies on inotify")
	}

	dir := t.TempDir()
	writeFile(t, dir, "segment_000.ts", "a")
	writeFile(t, dir, "segment_001.ts", "b")

	fs := newFakeStorage()
	up := newUploader(t, fs, dir, uploader.Options{})

	up.Start()
	require.Eventually(t, func() bool {
		return fs.distinctUploads() == 2
	}, 2*time.Second, 10*time.Millisecond, "both files must upload before Cancel")
	up.Cancel()

	require.Eventually(t, func() bool {
		return fs.deleteCount() >= 2
	}, 2*time.Second, 10*time.Millisecond, "Cancel must rollback uploaded files")
}

// TestUploader_NewPanicsOnNilStorage documents the defensive nil check.
func TestUploader_NewPanicsOnNilStorage(t *testing.T) {
	assert.Panics(t, func() {
		_ = uploader.New(context.Background(), nil, uploader.Options{})
	})
}
