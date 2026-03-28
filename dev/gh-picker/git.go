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

// CheckCherryPicked checks if commits have been cherry-picked
func CheckCherryPicked(commits []Commit, upstreamBranch string) ([]Commit, error) {
	if len(commits) == 0 {
		return commits, nil
	}

	// Get list of commits that are in upstream but NOT in current branch
	// These are the commits we need to cherry-pick
	out, err := GitExec("log", "HEAD.."+upstreamBranch, "--format=%H")
	if err != nil {
		return nil, err
	}

	// Build set of missing commit hashes
	missingHashes := make(map[string]bool)
	lines := strings.Split(strings.TrimSpace(out), "\n")
	for _, line := range lines {
		if line != "" {
			missingHashes[line] = true
		}
	}

	// Mark commits as cherry-picked if they are NOT in the missing set
	for i := range commits {
		// Commit is cherry-picked if it's NOT in the missing hashes
		commits[i].CherryPicked = !missingHashes[commits[i].Hash]
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
