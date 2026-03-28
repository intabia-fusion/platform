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
	"bytes"
	"fmt"
	"os/exec"
	"strings"
)

// Commit represents a git commit
type Commit struct {
	Hash         string
	ShortHash    string
	Subject      string
	Author       string
	Date         string
	CherryPicked bool
	HasConflict  bool   // True if cherry-pick would have conflicts
	Diff         string // Full diff of the commit
}

// GitExec runs a git command and returns the output
func GitExec(args ...string) (string, error) {
	cmd := exec.Command("git", args...)
	var out bytes.Buffer
	var stderr bytes.Buffer
	cmd.Stdout = &out
	cmd.Stderr = &stderr

	if err := cmd.Run(); err != nil {
		return "", fmt.Errorf("git %s failed: %v (stderr: %s)",
			strings.Join(args, " "), err, stderr.String())
	}

	return out.String(), nil
}

// GetCurrentBranch returns the current git branch
func GetCurrentBranch() (string, error) {
	out, err := GitExec("rev-parse", "--abbrev-ref", "HEAD")
	if err != nil {
		return "", err
	}
	return strings.TrimSpace(out), nil
}

// GetCommitsFromUpstream returns commits from upstream/develop that are not in current branch
func GetCommitsFromUpstream(upstreamBranch string) ([]Commit, error) {
	// Get commits in upstream but not in current branch
	// Format: hash|short|subject|author|date
	format := "%H|%h|%s|%an|%ad"
	out, err := GitExec("log", "HEAD.."+upstreamBranch, "--format="+format, "--date=short")
	if err != nil {
		return nil, err
	}

	lines := strings.Split(strings.TrimSpace(out), "\n")
	if len(lines) == 1 && lines[0] == "" {
		return []Commit{}, nil
	}

	commits := make([]Commit, 0, len(lines))
	for _, line := range lines {
		parts := strings.SplitN(line, "|", 5)
		if len(parts) < 5 {
			continue
		}

		commits = append(commits, Commit{
			Hash:      parts[0],
			ShortHash: parts[1],
			Subject:   parts[2],
			Author:    parts[3],
			Date:      parts[4],
		})
	}

	return commits, nil
}

// CheckCherryPicked checks if commits can be cleanly applied or are already applied
func CheckCherryPicked(commits []Commit, upstreamBranch string) ([]Commit, error) {
	if len(commits) == 0 {
		return commits, nil
	}

	// For each commit, check if it can be cleanly cherry-picked
	for i := range commits {
		commit := &commits[i]

		// First check if commit is already an ancestor of HEAD (already applied via merge or cherry-pick)
		_, err := GitExec("merge-base", "--is-ancestor", commit.Hash, "HEAD")
		if err == nil {
			// Commit is already in current branch
			commit.CherryPicked = true
			commit.HasConflict = false
			continue
		}

		// Check if a commit with the same subject already exists in HEAD
		// This catches cherry-picked commits (they have same subject but different hash)
		out, _ := GitExec("log", "HEAD", "--format=%s", "--grep="+commit.Subject, "-1")
		if strings.TrimSpace(out) == commit.Subject {
			// Found a commit with the same subject in HEAD
			commit.CherryPicked = true
			commit.HasConflict = false
			continue
		}

		// Get the diff/patch for this commit
		patch, err := GitExec("diff", commit.Hash+"^.."+commit.Hash)
		if err != nil {
			// Can't get diff, assume it might have conflicts
			commit.CherryPicked = false
			commit.HasConflict = false
			continue
		}

		if strings.TrimSpace(patch) == "" {
			// Empty patch, commit was already applied
			commit.CherryPicked = true
			commit.HasConflict = false
			continue
		}

		// Check if patch can be applied cleanly using git apply --check
		// This doesn't modify working directory
		cmd := exec.Command("git", "apply", "--check", "-")
		cmd.Stdin = strings.NewReader(patch)
		var stderr bytes.Buffer
		cmd.Stderr = &stderr
		err = cmd.Run()

		if err != nil {
			// Check if error is because patch is already applied ("already exists in working directory")
			stderrStr := stderr.String()
			if strings.Contains(stderrStr, "already exists") || strings.Contains(stderrStr, "No changes") {
				// Changes are already in HEAD, mark as cherry-picked
				commit.CherryPicked = true
				commit.HasConflict = false
			} else {
				// Patch would have conflicts
				commit.CherryPicked = false
				commit.HasConflict = true
			}
		} else {
			// Patch can be applied cleanly
			commit.CherryPicked = false
			commit.HasConflict = false
		}
	}

	return commits, nil
}

// CherryPick performs cherry-pick of the given commit
func CherryPick(hash string) error {
	_, err := GitExec("cherry-pick", hash)
	return err
}

// AbortCherryPick aborts current cherry-pick
func AbortCherryPick() error {
	_, err := GitExec("cherry-pick", "--abort")
	return err
}

// ContinueCherryPick continues cherry-pick after resolving conflicts
func ContinueCherryPick() error {
	_, err := GitExec("cherry-pick", "--continue")
	return err
}

// HasCherryPickInProgress checks if there's a cherry-pick in progress
func HasCherryPickInProgress() bool {
	_, err := GitExec("rev-parse", "--verify", "CHERRY_PICK_HEAD")
	return err == nil
}

// GetCommitDiff returns the diff for a specific commit
func GetCommitDiff(hash string) (string, error) {
	out, err := GitExec("show", hash, "--stat", "-p", "--color=never")
	if err != nil {
		return "", err
	}
	return out, nil
}
