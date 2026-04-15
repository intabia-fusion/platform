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

// CheckCherryPickedOne inspects a single commit and fills CherryPicked/HasConflict fields
func CheckCherryPickedOne(commit *Commit) {
	if _, err := GitExec("merge-base", "--is-ancestor", commit.Hash, "HEAD"); err == nil {
		commit.CherryPicked = true
		commit.HasConflict = false
		return
	}
	if out, _ := GitExec("log", "HEAD", "--format=%s", "--grep="+commit.Subject, "-1"); strings.TrimSpace(out) == commit.Subject {
		commit.CherryPicked = true
		commit.HasConflict = false
		return
	}
	patch, err := GitExec("diff", commit.Hash+"^.."+commit.Hash)
	if err != nil {
		commit.CherryPicked = false
		commit.HasConflict = false
		return
	}
	if strings.TrimSpace(patch) == "" {
		commit.CherryPicked = true
		commit.HasConflict = false
		return
	}
	cmd := exec.Command("git", "apply", "--check", "-")
	cmd.Stdin = strings.NewReader(patch)
	var stderr bytes.Buffer
	cmd.Stderr = &stderr
	if err := cmd.Run(); err != nil {
		stderrStr := stderr.String()
		if strings.Contains(stderrStr, "already exists") || strings.Contains(stderrStr, "No changes") {
			commit.CherryPicked = true
			commit.HasConflict = false
		} else {
			commit.CherryPicked = false
			commit.HasConflict = true
		}
		return
	}
	commit.CherryPicked = false
	commit.HasConflict = false
}

// CheckCherryPicked batch variant (no progress reporting)
func CheckCherryPicked(commits []Commit, upstreamBranch string) ([]Commit, error) {
	for i := range commits {
		CheckCherryPickedOne(&commits[i])
	}
	return commits, nil
}

// CherryPick performs cherry-pick of the given commit
func CherryPick(hash string) error {
	_, err := GitExec("cherry-pick", hash)
	return err
}

// CherryPickPaths applies only given paths from commit and creates a commit
// reusing the original author/message. Returns error if nothing changed or git fails.
func CherryPickPaths(hash string, paths []string) error {
	if len(paths) == 0 {
		return fmt.Errorf("no paths to apply from %s", hash)
	}
	// Capture patch limited to paths
	args := []string{"show", hash, "--binary", "--color=never", "--"}
	args = append(args, paths...)
	patch, err := GitExec(args...)
	if err != nil {
		return fmt.Errorf("get patch: %w", err)
	}
	if strings.TrimSpace(patch) == "" {
		return fmt.Errorf("no changes in commit %s under requested paths", hash)
	}
	// Apply to index + working tree
	cmd := exec.Command("git", "apply", "--index", "--3way")
	cmd.Stdin = strings.NewReader(patch)
	var stderr bytes.Buffer
	cmd.Stderr = &stderr
	if err := cmd.Run(); err != nil {
		return fmt.Errorf("git apply: %v (stderr: %s)", err, stderr.String())
	}
	// Reuse original commit metadata
	if _, err := GitExec("commit", "--no-verify", "-C", hash); err != nil {
		return fmt.Errorf("commit: %w", err)
	}
	return nil
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

// GetCommitDiffInFolder returns diff for commit limited to paths under folder
func GetCommitDiffInFolder(hash, folder string) (string, error) {
	pathspec := folder
	if !strings.HasSuffix(pathspec, "/") {
		pathspec += "/"
	}
	out, err := GitExec("show", hash, "--stat", "-p", "--color=never", "--", pathspec)
	if err != nil {
		return "", err
	}
	return out, nil
}

// GetCommitFilesInFolder returns files changed in commit that live under folder
func GetCommitFilesInFolder(hash, folder string) ([]string, error) {
	files, err := GetCommitFiles(hash)
	if err != nil {
		return nil, err
	}
	if folder == "" {
		return files, nil
	}
	prefix := folder
	if !strings.HasSuffix(prefix, "/") {
		prefix += "/"
	}
	var out []string
	for _, f := range files {
		if strings.HasPrefix(f, prefix) {
			out = append(out, f)
		}
	}
	return out, nil
}

// GetOutgoingCommits returns commits in HEAD not in upstream
func GetOutgoingCommits(upstreamBranch string) ([]Commit, error) {
	format := "%H|%h|%s|%an|%ad"
	out, err := GitExec("log", upstreamBranch+"..HEAD", "--format="+format, "--date=short")
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

// GetCommitFiles returns list of files changed in commit
func GetCommitFiles(hash string) ([]string, error) {
	out, err := GitExec("show", "--name-only", "--format=", hash)
	if err != nil {
		return nil, err
	}
	var files []string
	for _, line := range strings.Split(out, "\n") {
		line = strings.TrimSpace(line)
		if line != "" {
			files = append(files, line)
		}
	}
	return files, nil
}

// BranchExists checks if local branch exists
func BranchExists(name string) bool {
	_, err := GitExec("rev-parse", "--verify", "refs/heads/"+name)
	return err == nil
}

// CreateBranchFrom creates new branch from start point without checking out
func CreateBranchFrom(name, startPoint string) error {
	_, err := GitExec("branch", name, startPoint)
	return err
}

// CheckoutBranch switches to given branch
func CheckoutBranch(name string) error {
	_, err := GitExec("checkout", name)
	return err
}
