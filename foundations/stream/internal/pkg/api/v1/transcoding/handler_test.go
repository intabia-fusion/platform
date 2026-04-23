// Copyright © 2026 Intabia Fusion.
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

package transcoding_test

import (
	"bytes"
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/hcengineering/stream/internal/pkg/api/v1/transcoding"
	"github.com/hcengineering/stream/internal/pkg/config"
	"github.com/hcengineering/stream/internal/pkg/log"
	"github.com/stretchr/testify/assert"
)

func newTestHandler(t *testing.T, parallelCount int) http.Handler {
	t.Helper()
	ctx, cancel := context.WithCancel(log.WithFields(context.Background()))
	t.Cleanup(cancel)
	cfg := &config.Config{
		MaxParallelTranscodingCount: parallelCount,
		OutputDir:                   t.TempDir(),
	}
	// Mirror production mount: mux.Handle("/transcoding", StripPrefix("/transcoding", h)).
	return http.StripPrefix("/transcoding", transcoding.NewHandler(ctx, cfg))
}

func doRequest(h http.Handler, path, auth, body string) *httptest.ResponseRecorder {
	req := httptest.NewRequest(http.MethodPost, path, strings.NewReader(body))
	if auth != "" {
		req.Header.Set("Authorization", auth)
	}
	rr := httptest.NewRecorder()
	h.ServeHTTP(rr, req)
	return rr
}

func TestTranscode_RejectsNonRootPath(t *testing.T) {
	rr := doRequest(newTestHandler(t, 1), "/transcoding/junk", "Bearer x", `{"format":"hls"}`)
	assert.Equal(t, http.StatusBadRequest, rr.Code)
	assert.Contains(t, rr.Body.String(), "uri is not allowed")
}

func TestTranscode_RequiresAuthorization(t *testing.T) {
	rr := doRequest(newTestHandler(t, 1), "/transcoding", "", `{"format":"hls"}`)
	assert.Equal(t, http.StatusUnauthorized, rr.Code)
	assert.Contains(t, rr.Body.String(), "missed Authorization header")
}

func TestTranscode_RejectsMalformedJSON(t *testing.T) {
	rr := doRequest(newTestHandler(t, 1), "/transcoding", "Bearer x", `{not-json`)
	assert.Equal(t, http.StatusBadRequest, rr.Code)
	assert.Contains(t, rr.Body.String(), "can not decode request body")
}

func TestTranscode_RejectsUnsupportedFormat(t *testing.T) {
	rr := doRequest(newTestHandler(t, 1), "/transcoding", "Bearer x", `{"format":"mp4"}`)
	assert.Equal(t, http.StatusUnsupportedMediaType, rr.Code)
	assert.Contains(t, rr.Body.String(), "output media format is not supported")
}

func TestTranscode_AcceptsHLSCaseInsensitive(t *testing.T) {
	// parallelCount=0 keeps workers off so scheduled tasks never execute
	// downstream side effects; we only assert the HTTP contract here.
	for _, format := range []string{"hls", "HLS", "Hls"} {
		t.Run(format, func(t *testing.T) {
			body := `{"format":"` + format + `","source":"s3://bucket/key","workspace":"ws1"}`
			rr := doRequest(newTestHandler(t, 0), "/transcoding", "Bearer x", body)
			assert.Equal(t, http.StatusOK, rr.Code)
		})
	}
}

func TestTranscode_ReturnsTooManyRequestsWhenQueueFull(t *testing.T) {
	h := newTestHandler(t, 0)

	queueSize := 128
	body := `{"format":"hls","source":"s3://bucket/key","workspace":"ws1"}`

	var lastCode int
	for i := 0; i < queueSize+10; i++ {
		rr := doRequest(h, "/transcoding", "Bearer x", body)
		lastCode = rr.Code
		if rr.Code == http.StatusTooManyRequests {
			return
		}
	}
	t.Fatalf("expected 429 once the 128-slot queue filled up, last status was %d", lastCode)
}

func TestTranscode_LargeBodyRejectedAsMalformed(t *testing.T) {
	big := bytes.Repeat([]byte("a"), 1<<20)
	rr := doRequest(newTestHandler(t, 1), "/transcoding", "Bearer x", string(big))
	assert.Equal(t, http.StatusBadRequest, rr.Code)
}
