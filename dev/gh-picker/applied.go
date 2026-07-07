// Copyright © 2026 Intabia Fusion.
// Licensed under the Eclipse Public License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License. You may
// obtain a copy of the License at https://www.eclipse.org/legal/epl-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

package main

import (
	"crypto/sha1"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
)

// AppliedCache is a per-repo persistent set of incoming commit hashes proven
// fully applied (all content present) or manually marked applied. Stored in
// ~/.gh-picker/<repo-slug>.json so it survives across worktrees and refreshes.
// Invalidation is hash-based: a commit hash never changes content, so once
// applied it stays cached until reset.
type AppliedCache struct {
	Applied map[string]bool `json:"applied"`
	path    string
	dirty   bool
}

func appliedDir() (string, error) {
	home, err := os.UserHomeDir()
	if err != nil {
		return "", err
	}
	return filepath.Join(home, ".gh-picker"), nil
}

// repoSlug builds a stable filename from the repo toplevel path: basename plus
// a short hash of the full path to disambiguate same-named repos.
func repoSlug() (string, error) {
	out, err := GitExec("rev-parse", "--show-toplevel")
	if err != nil {
		return "", err
	}
	root := strings.TrimSpace(out)
	base := filepath.Base(root)
	sum := sha1.Sum([]byte(root))
	return fmt.Sprintf("%s-%x", base, sum[:4]), nil
}

func appliedCachePath() (string, error) {
	dir, err := appliedDir()
	if err != nil {
		return "", err
	}
	slug, err := repoSlug()
	if err != nil {
		return "", err
	}
	return filepath.Join(dir, slug+".json"), nil
}

// LoadAppliedCache reads the cache; returns an empty cache if the file is absent.
func LoadAppliedCache() (*AppliedCache, error) {
	c := &AppliedCache{Applied: map[string]bool{}}
	path, err := appliedCachePath()
	if err != nil {
		return c, err
	}
	c.path = path
	data, err := os.ReadFile(path)
	if err != nil {
		if os.IsNotExist(err) {
			return c, nil
		}
		return c, err
	}
	if len(data) == 0 {
		return c, nil
	}
	if err := json.Unmarshal(data, c); err != nil {
		return c, err
	}
	if c.Applied == nil {
		c.Applied = map[string]bool{}
	}
	return c, nil
}

// Has reports whether hash is cached as applied.
func (c *AppliedCache) Has(hash string) bool {
	return c.Applied[hash]
}

// Mark records hash as applied (in memory; call Save to persist).
func (c *AppliedCache) Mark(hash string) {
	if !c.Applied[hash] {
		c.Applied[hash] = true
		c.dirty = true
	}
}

// Clear empties the cache and persists the empty state.
func (c *AppliedCache) Clear() error {
	c.Applied = map[string]bool{}
	c.dirty = false
	if c.path == "" {
		return nil
	}
	if err := os.Remove(c.path); err != nil && !os.IsNotExist(err) {
		return err
	}
	return nil
}

// Save writes the cache to disk if changed, creating ~/.gh-picker if needed.
func (c *AppliedCache) Save() error {
	if !c.dirty {
		return nil
	}
	if c.path == "" {
		path, err := appliedCachePath()
		if err != nil {
			return err
		}
		c.path = path
	}
	if err := os.MkdirAll(filepath.Dir(c.path), 0o755); err != nil {
		return err
	}
	data, err := json.MarshalIndent(c, "", "  ")
	if err != nil {
		return err
	}
	if err := os.WriteFile(c.path, data, 0o644); err != nil {
		return err
	}
	c.dirty = false
	return nil
}
