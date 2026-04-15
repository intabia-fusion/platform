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
	"bufio"
	"os"
	"path/filepath"
	"strings"
)

const ignoreFileName = "gh-picker-ignored"

// IgnoreKind marks ignore category
type IgnoreKind string

const (
	KindIncoming IgnoreKind = "incoming"
	KindOutgoing IgnoreKind = "outgoing"
	KindMigrated IgnoreKind = "migrated"
)

// IgnoreStore holds all ignored hashes grouped by kind
type IgnoreStore struct {
	Incoming map[string]bool
	Outgoing map[string]bool
	Migrated map[string]bool
}

// NewIgnoreStore creates empty store
func NewIgnoreStore() *IgnoreStore {
	return &IgnoreStore{
		Incoming: map[string]bool{},
		Outgoing: map[string]bool{},
		Migrated: map[string]bool{},
	}
}

func ignoreFilePath() (string, error) {
	out, err := GitExec("rev-parse", "--git-dir")
	if err != nil {
		return "", err
	}
	return filepath.Join(strings.TrimSpace(out), ignoreFileName), nil
}

// LoadIgnoreStore reads ignore file. Format: "<kind> <hash>" per line.
// Bare hash lines treated as legacy incoming.
func LoadIgnoreStore() (*IgnoreStore, error) {
	s := NewIgnoreStore()
	path, err := ignoreFilePath()
	if err != nil {
		return nil, err
	}
	f, err := os.Open(path)
	if err != nil {
		if os.IsNotExist(err) {
			return s, nil
		}
		return nil, err
	}
	defer f.Close()
	sc := bufio.NewScanner(f)
	for sc.Scan() {
		line := strings.TrimSpace(sc.Text())
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		parts := strings.Fields(line)
		if len(parts) == 1 {
			s.Incoming[parts[0]] = true
			continue
		}
		kind, hash := IgnoreKind(parts[0]), parts[1]
		switch kind {
		case KindIncoming:
			s.Incoming[hash] = true
		case KindOutgoing:
			s.Outgoing[hash] = true
		case KindMigrated:
			s.Migrated[hash] = true
		}
	}
	return s, sc.Err()
}

// Save writes store back to file
func (s *IgnoreStore) Save() error {
	path, err := ignoreFilePath()
	if err != nil {
		return err
	}
	f, err := os.Create(path)
	if err != nil {
		return err
	}
	defer f.Close()
	w := bufio.NewWriter(f)
	write := func(kind IgnoreKind, set map[string]bool) error {
		for h := range set {
			if _, err := w.WriteString(string(kind) + " " + h + "\n"); err != nil {
				return err
			}
		}
		return nil
	}
	if err := write(KindIncoming, s.Incoming); err != nil {
		return err
	}
	if err := write(KindOutgoing, s.Outgoing); err != nil {
		return err
	}
	if err := write(KindMigrated, s.Migrated); err != nil {
		return err
	}
	return w.Flush()
}

// Add marks hash with kind
func (s *IgnoreStore) Add(kind IgnoreKind, hash string) {
	switch kind {
	case KindIncoming:
		s.Incoming[hash] = true
	case KindOutgoing:
		s.Outgoing[hash] = true
	case KindMigrated:
		s.Migrated[hash] = true
	}
}

// Remove clears hash from kind
func (s *IgnoreStore) Remove(kind IgnoreKind, hash string) {
	switch kind {
	case KindIncoming:
		delete(s.Incoming, hash)
	case KindOutgoing:
		delete(s.Outgoing, hash)
	case KindMigrated:
		delete(s.Migrated, hash)
	}
}

// Has reports whether hash is in given kind
func (s *IgnoreStore) Has(kind IgnoreKind, hash string) bool {
	switch kind {
	case KindIncoming:
		return s.Incoming[hash]
	case KindOutgoing:
		return s.Outgoing[hash]
	case KindMigrated:
		return s.Migrated[hash]
	}
	return false
}
