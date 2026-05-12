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

const sessionFileName = "gh-picker-session"

// Session holds persistent outgoing worktree info.
type Session struct {
	Branch   string
	Worktree string
}

func sessionFilePath() (string, error) {
	out, err := GitExec("rev-parse", "--git-dir")
	if err != nil {
		return "", err
	}
	return filepath.Join(strings.TrimSpace(out), sessionFileName), nil
}

// LoadSession reads session file; returns empty Session if file missing.
func LoadSession() (*Session, error) {
	s := &Session{}
	path, err := sessionFilePath()
	if err != nil {
		return s, err
	}
	f, err := os.Open(path)
	if err != nil {
		if os.IsNotExist(err) {
			return s, nil
		}
		return s, err
	}
	defer f.Close()
	sc := bufio.NewScanner(f)
	for sc.Scan() {
		line := strings.TrimSpace(sc.Text())
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		k, v, ok := strings.Cut(line, "=")
		if !ok {
			continue
		}
		switch strings.TrimSpace(k) {
		case "branch":
			s.Branch = strings.TrimSpace(v)
		case "worktree":
			s.Worktree = strings.TrimSpace(v)
		}
	}
	return s, sc.Err()
}

// Save writes session to disk.
func (s *Session) Save() error {
	path, err := sessionFilePath()
	if err != nil {
		return err
	}
	f, err := os.Create(path)
	if err != nil {
		return err
	}
	defer f.Close()
	w := bufio.NewWriter(f)
	if _, err := w.WriteString("branch=" + s.Branch + "\n"); err != nil {
		return err
	}
	if _, err := w.WriteString("worktree=" + s.Worktree + "\n"); err != nil {
		return err
	}
	return w.Flush()
}

// Clear removes session file.
func (s *Session) Clear() error {
	s.Branch = ""
	s.Worktree = ""
	path, err := sessionFilePath()
	if err != nil {
		return err
	}
	if err := os.Remove(path); err != nil && !os.IsNotExist(err) {
		return err
	}
	return nil
}

// Valid checks session worktree still exists.
func (s *Session) Valid() bool {
	if s == nil || s.Worktree == "" || s.Branch == "" {
		return false
	}
	if _, err := os.Stat(s.Worktree); err != nil {
		return false
	}
	return true
}
