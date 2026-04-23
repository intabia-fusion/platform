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

// Package executor provides command execution utilities.
package executor

import (
	"bufio"
	"context"
	"io"
	"os/exec"
	"sync"

	"github.com/hcengineering/stream/internal/pkg/log"
	"github.com/hcengineering/stream/internal/pkg/tracing"
	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/attribute"
	"go.opentelemetry.io/otel/trace"
	"go.uber.org/zap"
)

var tracer = otel.Tracer("executor")

// MaxStderrTailBytes is the maximum size of the stderr tail kept in memory for
// diagnostics. Older bytes are discarded. Prevents unbounded memory growth when
// ffmpeg runs with a verbose log level.
const MaxStderrTailBytes = 64 * 1024

// ringBuffer keeps the last capacity bytes written to it. Safe for a single writer.
// buf is preallocated to capacity bytes; pos is the next write offset; written is
// the total number of bytes written so far (capped conceptually — only used to
// tell "full" from "still filling").
type ringBuffer struct {
	mu       sync.Mutex
	buf      []byte
	capacity int
	pos      int
	written  int64
}

func newRingBuffer(capacity int) *ringBuffer {
	return &ringBuffer{buf: make([]byte, capacity), capacity: capacity}
}

func (r *ringBuffer) Write(p []byte) (int, error) {
	r.mu.Lock()
	defer r.mu.Unlock()

	n := len(p)
	r.written += int64(n)

	// If p is larger than the ring, only the last capacity bytes matter.
	if n >= r.capacity {
		copy(r.buf, p[n-r.capacity:])
		r.pos = 0
		return n, nil
	}

	first := copy(r.buf[r.pos:], p)
	if first < n {
		copy(r.buf, p[first:])
	}
	r.pos = (r.pos + n) % r.capacity
	return n, nil
}

// Bytes returns a copy of the buffered content in chronological order.
func (r *ringBuffer) Bytes() []byte {
	r.mu.Lock()
	defer r.mu.Unlock()

	if r.written < int64(r.capacity) {
		out := make([]byte, r.pos)
		copy(out, r.buf[:r.pos])
		return out
	}
	out := make([]byte, r.capacity)
	copy(out, r.buf[r.pos:])
	copy(out[r.capacity-r.pos:], r.buf[:r.pos])
	return out
}

// maxLogLineBytes caps how much of a single line we send to the logger. The
// underlying pipe is always drained — we just truncate the log message so a
// runaway ffmpeg line can't balloon per-line memory or log payload size.
const maxLogLineBytes = 8 * 1024

// streamToLogger reads lines from r and forwards them to the logger at debug
// level. Returns when r reaches EOF or errors. A tee writer captures the last
// MaxStderrTailBytes for diagnostics on failure.
//
// Uses bufio.Reader.ReadBytes instead of Scanner so that arbitrarily long lines
// can't stall the pipe — if ffmpeg emits a multi-MB stats line, Scanner would
// stop with ErrTooLong and the kernel pipe buffer would eventually fill, hanging
// cmd.Wait(). Reader keeps draining; we just cap the logged slice.
func streamToLogger(r io.Reader, tail *ringBuffer, logger *zap.Logger, stream string) {
	reader := bufio.NewReaderSize(io.TeeReader(r, tail), 64*1024)
	debugEnabled := logger.Core().Enabled(zap.DebugLevel)
	for {
		line, err := reader.ReadBytes('\n')
		if len(line) > 0 && debugEnabled {
			msg := line
			if len(msg) > maxLogLineBytes {
				msg = msg[:maxLogLineBytes]
			}
			// Trim trailing newline for readability.
			if n := len(msg); n > 0 && msg[n-1] == '\n' {
				msg = msg[:n-1]
			}
			logger.Debug(stream, zap.ByteString("line", msg))
		}
		if err != nil {
			if err != io.EOF {
				logger.Debug("stream read error", zap.String("stream", stream), zap.Error(err))
			}
			return
		}
	}
}

// ExecuteCommands executes multiple commands in parallel.
// stdout/stderr of each command is streamed through bounded ring buffers so
// memory usage stays constant regardless of process lifetime. On failure, the
// tail of stderr is emitted to the logger for diagnostics.
func ExecuteCommands(ctx context.Context, commands []*exec.Cmd) error {
	logger := log.FromContext(ctx)
	errCh := make(chan error, len(commands))

	var wg sync.WaitGroup
	for _, cmd := range commands {
		wg.Add(1)

		go func(cmd *exec.Cmd) {
			defer wg.Done()

			_, span := tracer.Start(ctx, "cmd", trace.WithAttributes(
				attribute.String("command", cmd.String()),
			))
			defer span.End()

			stdoutTail := newRingBuffer(MaxStderrTailBytes)
			stderrTail := newRingBuffer(MaxStderrTailBytes)

			stdout, err := cmd.StdoutPipe()
			if err != nil {
				tracing.RecordError(span, err)
				errCh <- err
				return
			}
			stderr, err := cmd.StderrPipe()
			if err != nil {
				tracing.RecordError(span, err)
				errCh <- err
				return
			}

			logger.Info("run command", zap.String("cmd", cmd.String()))
			if err := cmd.Start(); err != nil {
				tracing.RecordError(span, err)
				errCh <- err
				return
			}

			var pumpWg sync.WaitGroup
			pumpWg.Add(2)
			go func() {
				defer pumpWg.Done()
				streamToLogger(stdout, stdoutTail, logger, "stdout")
			}()
			go func() {
				defer pumpWg.Done()
				streamToLogger(stderr, stderrTail, logger, "stderr")
			}()
			pumpWg.Wait()

			if err := cmd.Wait(); err != nil {
				tracing.RecordError(span, err)
				errCh <- err
				logger.Error("command failed",
					zap.Error(err),
					zap.String("cmd", cmd.String()),
					zap.ByteString("stderr_tail", stderrTail.Bytes()),
					zap.ByteString("stdout_tail", stdoutTail.Bytes()),
				)
			}
		}(cmd)
	}

	wg.Wait()
	close(errCh)

	for err := range errCh {
		return err
	}

	return nil
}
