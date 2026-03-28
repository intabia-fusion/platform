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

// CheckCherryPicked checks if commits have been cherry-picked using git cherry
func CheckCherryPicked(commits []Commit, upstreamBranch string) ([]Commit, error) {
	if len(commits) == 0 {
		return commits, nil
	}

	// Get cherry status for all commits
	// git cherry -v shows: "- hash subject" (not cherry-picked) or "+ hash subject" (cherry-picked)
	out, err := GitExec("cherry", "-v", "HEAD", upstreamBranch)
	if err != nil {
		return nil, err
	}

	// Parse cherry output
	cherryMap := make(map[string]bool)
	lines := strings.Split(strings.TrimSpace(out), "\n")
	for _, line := range lines {
		if len(line) < 2 {
			continue
		}

		// Line format: "- hash" or "+ hash"
		parts := strings.Fields(line)
		if len(parts) >= 2 {
			hash := parts[1]
			// "+" means already applied (cherry-picked), "-" means not applied
			cherryMap[hash] = line[0] == '+'
		}
	}

	// Update commits with cherry-pick status
	// Invert the logic: git cherry marks as "+" (already applied) what we DON'T need
	// We want to show commits that are NOT cherry-picked yet
	for i := range commits {
		if cherryPicked, ok := cherryMap[commits[i].Hash]; ok {
			// "+" means already applied (cherry-picked) - we DON'T want to show these
			// "-" means not applied yet - we DO want to show these
			commits[i].CherryPicked = !cherryPicked
		} else {
			// If not in cherry output, assume it's already cherry-picked
			commits[i].CherryPicked = true
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
