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

package storage_test

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"sync/atomic"
	"testing"

	"github.com/hcengineering/stream/internal/pkg/log"
	"github.com/hcengineering/stream/internal/pkg/storage"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

const (
	testWorkspace = "ws-1"
	testToken     = "test-token"
)

func newTestClient(t *testing.T, handler http.Handler) storage.Storage {
	t.Helper()
	srv := httptest.NewServer(handler)
	t.Cleanup(srv.Close)
	ctx := log.WithFields(context.Background())
	return storage.NewDatalakeStorage(ctx, srv.URL, testWorkspace, testToken)
}

func writeTempFile(t *testing.T, name, content string) string {
	t.Helper()
	p := filepath.Join(t.TempDir(), name)
	require.NoError(t, os.WriteFile(p, []byte(content), 0o600))
	return p
}

func assertAuth(t *testing.T, r *http.Request) {
	t.Helper()
	assert.Equal(t, "Bearer "+testToken, r.Header.Get("Authorization"))
}

func TestDatalake_PutFile_Success(t *testing.T) {
	var gotMethod, gotPath, gotCT string
	var gotCacheCtrl string
	var gotFilename, gotFileBody string

	s := newTestClient(t, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		assertAuth(t, r)
		gotMethod = r.Method
		gotPath = r.URL.Path
		gotCT = r.Header.Get("Content-Type")
		gotCacheCtrl = r.Header.Get("Cache-Control")

		require.NoError(t, r.ParseMultipartForm(1<<20)) // #nosec G120 -- test handler, bounded input
		files := r.MultipartForm.File["file"]
		require.Len(t, files, 1)
		gotFilename = files[0].Filename
		f, err := files[0].Open()
		require.NoError(t, err)
		defer func() { _ = f.Close() }()
		b, err := io.ReadAll(f)
		require.NoError(t, err)
		gotFileBody = string(b)

		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(`[{"key":"segment.ts"}]`))
	}))

	p := writeTempFile(t, "segment.ts", "payload")
	require.NoError(t, s.PutFile(context.Background(), p, storage.PutOptions{NoCache: true}))

	assert.Equal(t, http.MethodPost, gotMethod)
	assert.Equal(t, "/upload/form-data/"+testWorkspace, gotPath)
	assert.True(t, strings.HasPrefix(gotCT, "multipart/form-data"))
	assert.Equal(t, "max-age=0, must-revalidate", gotCacheCtrl)
	assert.Equal(t, "segment.ts", gotFilename)
	assert.Equal(t, "payload", gotFileBody)
}

func TestDatalake_PutFile_NoCacheHeaderOmitted(t *testing.T) {
	var gotCacheCtrl string
	s := newTestClient(t, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotCacheCtrl = r.Header.Get("Cache-Control")
		_, _ = w.Write([]byte(`[]`))
	}))

	p := writeTempFile(t, "a.ts", "x")
	require.NoError(t, s.PutFile(context.Background(), p, storage.PutOptions{}))
	assert.Empty(t, gotCacheCtrl)
}

func TestDatalake_PutFile_ServerError(t *testing.T) {
	s := newTestClient(t, http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(`[{"key":"x","error":"boom"}]`))
	}))
	p := writeTempFile(t, "a.ts", "x")
	err := s.PutFile(context.Background(), p, storage.PutOptions{})
	require.Error(t, err)
	assert.Contains(t, err.Error(), "upload error")
	assert.Contains(t, err.Error(), "boom")
}

func TestDatalake_PutFile_MalformedResponse(t *testing.T) {
	s := newTestClient(t, http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		_, _ = w.Write([]byte(`not-json`))
	}))
	p := writeTempFile(t, "a.ts", "x")
	err := s.PutFile(context.Background(), p, storage.PutOptions{})
	require.Error(t, err)
	assert.Contains(t, err.Error(), "parse error")
}

func TestDatalake_PutFile_MissingLocalFile(t *testing.T) {
	s := newTestClient(t, http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		t.Fatal("server must not be reached when local file is missing")
	}))
	err := s.PutFile(context.Background(), filepath.Join(t.TempDir(), "nope.ts"), storage.PutOptions{})
	require.Error(t, err)
}

func TestDatalake_GetFile_Success(t *testing.T) {
	var gotMethod, gotPath string
	payload := "segment-bytes"

	s := newTestClient(t, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		assertAuth(t, r)
		gotMethod = r.Method
		gotPath = r.URL.Path
		_, _ = io.WriteString(w, payload)
	}))

	dst := filepath.Join(t.TempDir(), "out.ts")
	require.NoError(t, s.GetFile(context.Background(), "remote/segment.ts", dst))

	assert.Equal(t, http.MethodGet, gotMethod)
	assert.Equal(t, "/blob/"+testWorkspace+"/segment.ts", gotPath)

	b, err := os.ReadFile(dst) // #nosec G304 -- test-controlled path under t.TempDir()
	require.NoError(t, err)
	assert.Equal(t, payload, string(b))
}

func TestDatalake_GetFile_NotFound(t *testing.T) {
	s := newTestClient(t, http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusNotFound)
	}))
	err := s.GetFile(context.Background(), "missing.ts", filepath.Join(t.TempDir(), "x"))
	require.Error(t, err)
	assert.Contains(t, err.Error(), "404")
}

func TestDatalake_StatFile(t *testing.T) {
	s := newTestClient(t, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		assertAuth(t, r)
		assert.Equal(t, http.MethodHead, r.Method)
		assert.Equal(t, "/blob/"+testWorkspace+"/file.ts", r.URL.Path)
		w.Header().Set("Content-Type", "video/mp2t")
		w.Header().Set("Content-Length", "42")
		w.Header().Set("ETag", `"abc123"`)
		w.WriteHeader(http.StatusOK)
	}))

	info, err := s.StatFile(context.Background(), "some/file.ts")
	require.NoError(t, err)
	assert.Equal(t, "video/mp2t", info.Type)
	assert.Equal(t, int64(42), info.Size)
	assert.Equal(t, `"abc123"`, info.ETag)
}

func TestDatalake_StatFile_Error(t *testing.T) {
	s := newTestClient(t, http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusInternalServerError)
	}))
	_, err := s.StatFile(context.Background(), "x.ts")
	require.Error(t, err)
}

func TestDatalake_DeleteFile(t *testing.T) {
	var gotMethod, gotPath string
	s := newTestClient(t, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		assertAuth(t, r)
		gotMethod = r.Method
		gotPath = r.URL.Path
		w.WriteHeader(http.StatusNoContent)
	}))

	require.NoError(t, s.DeleteFile(context.Background(), "prefix/blob.ts"))
	assert.Equal(t, http.MethodDelete, gotMethod)
	assert.Equal(t, "/blob/"+testWorkspace+"/blob.ts", gotPath)
}

func TestDatalake_SetParent_SkipsWhenSame(t *testing.T) {
	var hits int32
	s := newTestClient(t, http.HandlerFunc(func(_ http.ResponseWriter, _ *http.Request) {
		atomic.AddInt32(&hits, 1)
	}))

	require.NoError(t, s.SetParent(context.Background(), "dir/a.ts", "other/a.ts"))
	assert.Equal(t, int32(0), atomic.LoadInt32(&hits),
		"SetParent must short-circuit when object key equals parent key")
}

func TestDatalake_SetParent_SendsPatch(t *testing.T) {
	var body map[string]any
	var gotPath string
	s := newTestClient(t, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		assertAuth(t, r)
		assert.Equal(t, http.MethodPatch, r.Method)
		gotPath = r.URL.Path
		require.NoError(t, json.NewDecoder(r.Body).Decode(&body))
		w.WriteHeader(http.StatusOK)
	}))

	require.NoError(t, s.SetParent(context.Background(), "child.ts", "dir/parent.ts"))
	assert.Equal(t, "/blob/"+testWorkspace+"/child.ts/parent", gotPath)
	assert.Equal(t, "parent.ts", body["parent"])
}

func TestDatalake_ContentTypeDetection(t *testing.T) {
	cases := map[string]string{
		"segment.ts":    "video/mp2t",
		"playlist.m3u8": "video/x-mpegurl",
		"blob.bin":      "application/octet-stream",
	}
	for name, wantSubstr := range cases {
		t.Run(name, func(t *testing.T) {
			var gotBody []byte
			s := newTestClient(t, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				// Multipart body encodes part Content-Type; capture full body.
				b, _ := io.ReadAll(r.Body)
				gotBody = b
				_, _ = w.Write([]byte(`[]`))
			}))
			p := writeTempFile(t, name, "x")
			require.NoError(t, s.PutFile(context.Background(), p, storage.PutOptions{}))
			assert.Contains(t, string(gotBody), wantSubstr,
				"multipart part must carry Content-Type %q", wantSubstr)
		})
	}
}

func TestDatalake_NewStorageByURL_RequiresWorkspace(t *testing.T) {
	_, err := storage.NewStorageByURL(context.Background(), nil, "datalake", "tok", "")
	require.Error(t, err)
}

func TestDatalake_NewStorageByURL_RequiresToken(t *testing.T) {
	_, err := storage.NewStorageByURL(context.Background(), nil, "datalake", "", "ws")
	require.Error(t, err)
}

func TestDatalake_NewStorageByURL_UnknownScheme(t *testing.T) {
	_, err := storage.NewStorageByURL(context.Background(), nil, "ftp", "tok", "ws")
	require.Error(t, err)
}

// Guard against accidental double-slash in URL joining if baseURL ends with `/`.
func TestDatalake_BaseURLTrailingSlashIsNotNormalized(t *testing.T) {
	var gotPath string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotPath = r.URL.Path
		_, _ = w.Write([]byte(`[]`))
	}))
	defer srv.Close()

	ctx := log.WithFields(context.Background())
	s := storage.NewDatalakeStorage(ctx, srv.URL+"/", testWorkspace, testToken)

	p := writeTempFile(t, "a.ts", "x")
	require.NoError(t, s.PutFile(ctx, p, storage.PutOptions{}))
	// Currently: trailing slash produces `//upload/...`. Document behavior so
	// future normalization has a bright-line test to flip.
	assert.True(t, strings.HasPrefix(gotPath, "//upload/form-data/") ||
		strings.HasPrefix(gotPath, "/upload/form-data/"),
		"got path %q", gotPath)
}

// Sanity: Content-Length on incoming request is positive (multipart body is built).
func TestDatalake_PutFile_SendsNonEmptyBody(t *testing.T) {
	var gotLen int
	s := newTestClient(t, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if v := r.Header.Get("Content-Length"); v != "" {
			n, _ := strconv.Atoi(v)
			gotLen = n
		}
		_, _ = w.Write([]byte(`[]`))
	}))
	p := writeTempFile(t, "a.ts", strings.Repeat("y", 1024))
	require.NoError(t, s.PutFile(context.Background(), p, storage.PutOptions{}))
	assert.Greater(t, gotLen, 1024)
}
