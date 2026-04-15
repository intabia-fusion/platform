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
	"fmt"
	"path/filepath"
	"time"

	tea "github.com/charmbracelet/bubbletea"
)

// Messages
type commitsMsg struct {
	commits []Commit
	files   map[string][]string // set only in outgoing mode
}

type errorMsg struct {
	err error
}

type diffMsg struct {
	hash string
	diff string
}

type cherryPickResultMsg struct {
	success bool
	hash    string
	err     error
}

type migrateResultMsg struct {
	branch   string
	hashes   []string
	worktree string
	err      error
}

// progressMsg is emitted while long operations are running
type progressMsg struct {
	done    int
	total   int
	started time.Time
}

// loadProgressCh is the channel bridging a running load goroutine with Bubbletea.
// A single goroutine writes progressMsg/commitsMsg/errorMsg values; Model pulls
// them via waitForProgress command.
var loadProgressCh chan tea.Msg

// waitForProgress returns a command that waits for the next message on the
// shared progress channel.
func waitForProgress() tea.Cmd {
	return func() tea.Msg {
		if loadProgressCh == nil {
			return nil
		}
		msg, ok := <-loadProgressCh
		if !ok {
			return nil
		}
		return msg
	}
}

// loadCommitsFor fetches commits for the current mode
func loadCommitsFor(mode AppMode, upstream string) tea.Cmd {
	if mode == ModeOutgoing {
		return loadOutgoing(upstream)
	}
	return loadIncoming(upstream)
}

func loadIncoming(upstream string) tea.Cmd {
	loadProgressCh = make(chan tea.Msg, 8)
	go func() {
		defer close(loadProgressCh)
		commits, err := GetCommitsFromUpstream(upstream)
		if err != nil {
			loadProgressCh <- errorMsg{err: err}
			return
		}
		total := len(commits)
		started := time.Now()
		loadProgressCh <- progressMsg{done: 0, total: total, started: started}
		lastTick := time.Now()
		for i := range commits {
			CheckCherryPickedOne(&commits[i])
			if time.Since(lastTick) > 50*time.Millisecond || (i+1)%10 == 0 || i == total-1 {
				loadProgressCh <- progressMsg{done: i + 1, total: total, started: started}
				lastTick = time.Now()
			}
		}
		loadProgressCh <- commitsMsg{commits: commits}
	}()
	return waitForProgress()
}

func loadOutgoing(upstream string) tea.Cmd {
	// Channel buffer big enough to avoid stalls between progress ticks and UI reads
	loadProgressCh = make(chan tea.Msg, 8)
	go func() {
		defer close(loadProgressCh)
		commits, err := GetOutgoingCommits(upstream)
		if err != nil {
			loadProgressCh <- errorMsg{err: err}
			return
		}
		total := len(commits)
		started := time.Now()
		loadProgressCh <- progressMsg{done: 0, total: total, started: started}
		files := make(map[string][]string, total)
		lastTick := time.Now()
		for i, c := range commits {
			fs, err := GetCommitFiles(c.Hash)
			if err == nil {
				files[c.Hash] = fs
			}
			// Emit progress periodically (every 50ms or every 10 commits)
			if time.Since(lastTick) > 50*time.Millisecond || (i+1)%10 == 0 || i == total-1 {
				loadProgressCh <- progressMsg{done: i + 1, total: total, started: started}
				lastTick = time.Now()
			}
		}
		loadProgressCh <- commitsMsg{commits: commits, files: files}
	}()
	return waitForProgress()
}

func loadDiff(hash string) tea.Cmd {
	return func() tea.Msg {
		diff, err := GetCommitDiff(hash)
		if err != nil {
			return errorMsg{err: err}
		}
		return diffMsg{hash: hash, diff: diff}
	}
}

// loadDiffFiltered returns diff for commit restricted to paths under folder.
// If folder == "", behaves like loadDiff.
func loadDiffFiltered(hash, folder string) tea.Cmd {
	if folder == "" {
		return loadDiff(hash)
	}
	return func() tea.Msg {
		diff, err := GetCommitDiffInFolder(hash, folder)
		if err != nil {
			return errorMsg{err: err}
		}
		return diffMsg{hash: hash, diff: diff}
	}
}

// loadDiffCmd picks the right diff loader based on mode/folder.
func (m Model) loadDiffCmd(hash string) tea.Cmd {
	if m.mode == ModeOutgoing && m.selectedFolder != "" {
		return loadDiffFiltered(hash, m.selectedFolder)
	}
	return loadDiff(hash)
}

// migrateCmd creates a new branch from upstream and cherry-picks the selected
// commits (optionally limited to folder paths) onto it, then returns to the
// original branch. If folder is "", full commits are cherry-picked.
func migrateCmd(branch, upstream, origBranch, folder string, hashes []string) tea.Cmd {
	_ = origBranch
	return func() tea.Msg {
		repoRoot, err := GitExec("rev-parse", "--show-toplevel")
		if err != nil {
			return migrateResultMsg{err: fmt.Errorf("repo root: %w", err)}
		}
		root := trimNL(repoRoot)
		wtDir := filepath.Join(filepath.Dir(root), "merges", branch)
		if err := WorktreeAdd(wtDir, branch, upstream); err != nil {
			return migrateResultMsg{err: fmt.Errorf("worktree add: %w", err)}
		}
		applied := make([]string, 0, len(hashes))
		for i := len(hashes) - 1; i >= 0; i-- {
			h := hashes[i]
			var err error
			if folder == "" {
				err = CherryPickIn(wtDir, h)
			} else {
				paths, perr := GetCommitFilesInFolder(h, folder)
				if perr != nil {
					err = perr
				} else if len(paths) == 0 {
					continue
				} else {
					err = CherryPickPathsIn(wtDir, h, paths)
				}
			}
			if err != nil {
				_, _ = GitExecIn(wtDir, "cherry-pick", "--abort")
				return migrateResultMsg{err: fmt.Errorf("apply %s: %w", h[:8], err)}
			}
			applied = append(applied, h)
		}
		if len(applied) == 0 {
			_, _ = GitExec("worktree", "remove", "--force", wtDir)
			_, _ = GitExec("branch", "-D", branch)
			return migrateResultMsg{err: fmt.Errorf("no commits applied (none had files under %q)", folder)}
		}
		return migrateResultMsg{branch: branch, hashes: applied, worktree: wtDir}
	}
}

func trimNL(s string) string {
	for len(s) > 0 && (s[len(s)-1] == '\n' || s[len(s)-1] == '\r' || s[len(s)-1] == ' ') {
		s = s[:len(s)-1]
	}
	return s
}

func (m Model) cherryPickSelected() tea.Cmd {
	var selected []Commit
	for _, item := range m.items {
		if item.selected {
			selected = append(selected, item.commit)
		}
	}
	if len(selected) == 0 {
		return func() tea.Msg {
			return errorMsg{err: fmt.Errorf("no commits selected")}
		}
	}
	return func() tea.Msg {
		if HasCherryPickInProgress() {
			if err := AbortCherryPick(); err != nil {
				return cherryPickResultMsg{success: false, hash: "", err: fmt.Errorf("failed to abort previous cherry-pick: %v", err)}
			}
		}
		for i := len(selected) - 1; i >= 0; i-- {
			commit := selected[i]
			if err := CherryPick(commit.Hash); err != nil {
				return cherryPickResultMsg{success: false, hash: commit.Hash, err: err}
			}
		}
		return cherryPickResultMsg{success: true, hash: selected[0].Hash}
	}
}
