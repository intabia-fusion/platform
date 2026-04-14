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

// ignoreFilePath returns path to ignore file inside .git dir
func ignoreFilePath() (string, error) {
	out, err := GitExec("rev-parse", "--git-dir")
	if err != nil {
		return "", err
	}
	gitDir := strings.TrimSpace(out)
	return filepath.Join(gitDir, ignoreFileName), nil
}

// LoadIgnored reads set of ignored commit hashes
func LoadIgnored() (map[string]bool, error) {
	path, err := ignoreFilePath()
	if err != nil {
		return nil, err
	}
	ignored := make(map[string]bool)
	f, err := os.Open(path)
	if err != nil {
		if os.IsNotExist(err) {
			return ignored, nil
		}
		return nil, err
	}
	defer f.Close()
	s := bufio.NewScanner(f)
	for s.Scan() {
		line := strings.TrimSpace(s.Text())
		if line != "" && !strings.HasPrefix(line, "#") {
			ignored[line] = true
		}
	}
	return ignored, s.Err()
}

// SaveIgnored writes set of ignored hashes to file
func SaveIgnored(ignored map[string]bool) error {
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
	for hash := range ignored {
		if _, err := w.WriteString(hash + "\n"); err != nil {
			return err
		}
	}
	return w.Flush()
}

// AddIgnored appends hash to ignore set
func AddIgnored(hash string) error {
	ignored, err := LoadIgnored()
	if err != nil {
		return err
	}
	ignored[hash] = true
	return SaveIgnored(ignored)
}

// RemoveIgnored removes hash from ignore set
func RemoveIgnored(hash string) error {
	ignored, err := LoadIgnored()
	if err != nil {
		return err
	}
	delete(ignored, hash)
	return SaveIgnored(ignored)
}
