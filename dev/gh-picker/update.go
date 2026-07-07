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
	"strings"

	"github.com/charmbracelet/bubbles/key"
	tea "github.com/charmbracelet/bubbletea"
)

// Update handles messages
func (m Model) Update(msg tea.Msg) (tea.Model, tea.Cmd) {
	switch msg := msg.(type) {
	case tea.WindowSizeMsg:
		m.width = msg.Width
		m.height = msg.Height
		m.handleResize()
		return m, nil

	case tea.KeyMsg:
		if m.promptActive {
			return m.updatePrompt(msg)
		}
		return m.handleKey(msg)

	case commitsMsg:
		return m.onCommits(msg)

	case progressMsg:
		m.progressDone = msg.done
		m.progressTotal = msg.total
		m.progressStarted = msg.started
		return m, waitForProgress()

	case errorMsg:
		m.loading = false
		m.err = msg.err
		m.message = fmt.Sprintf("Error: %v", msg.err)
		return m, nil

	case diffMsg:
		m.currentDiff = msg.diff
		m.currentDiffKey = msg.key
		for i := range m.items {
			if m.items[i].commit.Hash == msg.hash {
				m.items[i].commit.Diff = msg.diff
				break
			}
		}
		return m, nil

	case cherryPickResultMsg:
		if msg.success {
			m.message = successStyle.Render(fmt.Sprintf("✓ Cherry-picked %s", msg.hash[:7]))
			if m.cursor >= 0 && m.cursor < len(m.items) {
				m.pendingCursorHash = m.items[m.cursor].commit.Hash
			}
			m.loading = true
			return m, loadCommitsFor(m.mode, m.upstream, m.applied)
		}
		m.message = errorStyle.Render(fmt.Sprintf("✗ Failed: %v", msg.err))
		return m, nil

	case loadFileDiffMsg:
		if m.cursor < 0 || m.cursor >= len(m.items) {
			return m, nil
		}
		if m.items[m.cursor].commit.Hash == msg.hash {
			m.items[m.cursor].commit.Diff = msg.diff
		}
		return m, nil

	case applyResultMsg:
		m.migrating = false
		m.loading = false
		if msg.err != nil {
			m.message = errorStyle.Render(fmt.Sprintf("✗ Apply failed: %v", msg.err))
			return m, nil
		}
		for _, f := range msg.applied {
			m.store.MarkApplied("file", f)
			delete(m.pickedFile, f)
		}
		if err := m.store.Save(); err != nil {
			m.message = errorStyle.Render(fmt.Sprintf("save applied failed: %v", err))
			return m, nil
		}
		switch {
		case len(msg.failed) > 0:
			m.message = errorStyle.Render(fmt.Sprintf(
				"✓ %d applied, ✗ %d failed → %s",
				len(msg.applied), len(msg.failed), msg.worktree))
		default:
			m.message = successStyle.Render(fmt.Sprintf(
				"✓ Applied %d files to %s (worktree: %s)",
				len(msg.applied), msg.branch, msg.worktree))
		}
		m.rebuildCenterRows()
		return m, nil

	case migrateResultMsg:
		m.migrating = false
		if msg.err != nil {
			m.loading = false
			m.message = errorStyle.Render(fmt.Sprintf("✗ Migrate failed: %v", msg.err))
			return m, nil
		}
		for _, h := range msg.hashes {
			m.store.Add(KindMigrated, h)
		}
		if err := m.store.Save(); err != nil {
			m.message = errorStyle.Render(fmt.Sprintf("save ignore failed: %v", err))
			return m, nil
		}
		m.message = successStyle.Render(fmt.Sprintf(
			"✓ Migrated %d commits to %s (worktree: %s). Push: cd %s && git push -u upstream %s",
			len(msg.hashes), msg.branch, msg.worktree, msg.worktree, msg.branch))
		m.loading = true
		return m, loadCommitsFor(m.mode, m.upstream, m.applied)
	}

	return m, nil
}

func (m Model) handleKey(msg tea.KeyMsg) (tea.Model, tea.Cmd) {
	switch {
	case key.Matches(msg, m.keys.Quit):
		return m, tea.Quit

	case key.Matches(msg, m.keys.Help):
		m.showHelp = !m.showHelp
		return m, nil

	case key.Matches(msg, m.keys.Refresh):
		m.loading = true
		m.message = ""
		if m.cursor >= 0 && m.cursor < len(m.items) {
			m.pendingCursorHash = m.items[m.cursor].commit.Hash
		}
		return m, loadCommitsFor(m.mode, m.upstream, m.applied)

	case key.Matches(msg, m.keys.Mode):
		if m.mode == ModeIncoming {
			m.mode = ModeOutgoing
		} else {
			m.mode = ModeIncoming
		}
		m.showIgnored = false
		m.selectedFolder = ""
		m.cursor = 0
		m.centerCursor = 0
		m.centerRows = nil
		m.treeCursor = 0
		m.loading = true
		m.message = ""
		m.handleResize()
		return m, loadCommitsFor(m.mode, m.upstream, m.applied)

	case key.Matches(msg, m.keys.Ignore):
		return m.handleIgnore()

	case key.Matches(msg, m.keys.MarkApplied):
		return m.handleMarkApplied()

	case key.Matches(msg, m.keys.ResetApplied):
		return m.handleResetApplied()

	case key.Matches(msg, m.keys.ShowIgnored):
		m.showIgnored = !m.showIgnored
		m.loading = true
		m.message = ""
		return m, loadCommitsFor(m.mode, m.upstream, m.applied)

	case key.Matches(msg, m.keys.Tab):
		m.cycleFocus()
		return m, nil

	case key.Matches(msg, m.keys.Left):
		return m, nil

	case key.Matches(msg, m.keys.Right):
		return m, nil

	case key.Matches(msg, m.keys.Up):
		return m.handleUp()

	case key.Matches(msg, m.keys.Down):
		return m.handleDown()

	case key.Matches(msg, m.keys.PageUp):
		return m.handlePageUp()

	case key.Matches(msg, m.keys.PageDown):
		return m.handlePageDown()

	case key.Matches(msg, m.keys.Toggle):
		if m.mode == ModeOutgoing && m.focus == focusCommits {
			return m.handleOutgoingToggle()
		}
		if m.focus == focusTree {
			if m.treeCursor >= 0 && m.treeCursor < len(m.treeFlat) {
				n := m.treeFlat[m.treeCursor]
				if len(n.children) > 0 {
					n.expanded = !n.expanded
					if m.treeExpanded == nil {
						m.treeExpanded = map[string]bool{}
					}
					m.treeExpanded[n.path] = n.expanded
					m.rebuildTreeFlat()
				}
				m.selectedFolder = n.path
				m.reapplyViewAfterFolder()
				m.rebuildCenterRows()
				m.currentDiff = ""
				m.currentDiffKey = ""
				if m.mode == ModeOutgoing && len(m.centerRows) > 0 {
					return m, m.loadDiffForRow(m.centerRows[0])
				}
				if len(m.items) > 0 {
					return m, m.loadDiffCmd(m.items[0].commit.Hash)
				}
			}
		} else if m.cursor >= 0 && m.cursor < len(m.items) {
			m.items[m.cursor].selected = !m.items[m.cursor].selected
		}
		return m, nil

	case key.Matches(msg, m.keys.ToggleAll):
		if m.mode == ModeOutgoing {
			return m.handleOutgoingToggleAll()
		}
		allSelected := true
		for _, item := range m.items {
			if !item.selected {
				allSelected = false
				break
			}
		}
		for i := range m.items {
			m.items[i].selected = !allSelected
		}
		return m, nil

	case key.Matches(msg, m.keys.CherryPick):
		if m.mode == ModeIncoming {
			return m, m.cherryPickSelected()
		}
		return m, nil

	case key.Matches(msg, m.keys.Migrate):
		if m.mode == ModeOutgoing {
			files := m.pickedFiles()
			if len(files) == 0 {
				m.message = errorStyle.Render("no files selected")
				return m, nil
			}
			if m.session.Valid() {
				m.loading = true
				m.migrating = true
				m.migratingBranch = m.session.Branch
				m.migratingCount = len(files)
				return m, applyFilesCmd(m.session, m.session.Branch, m.upstream, files)
			}
			m.promptActive = true
			m.promptValue = ""
			m.message = ""
		}
		return m, nil
	}
	return m, nil
}

// handleOutgoingToggle toggles pick state of the file under cursor.
func (m Model) handleOutgoingToggle() (tea.Model, tea.Cmd) {
	r := m.currentCenterRow()
	if r.kind != rowFile || r.file == "" {
		return m, nil
	}
	if m.pickedFile == nil {
		m.pickedFile = map[string]bool{}
	}
	if m.pickedFile[r.file] {
		delete(m.pickedFile, r.file)
	} else {
		m.pickedFile[r.file] = true
	}
	return m, nil
}

// handleOutgoingToggleAll toggles pick state of every visible file.
func (m Model) handleOutgoingToggleAll() (tea.Model, tea.Cmd) {
	if m.pickedFile == nil {
		m.pickedFile = map[string]bool{}
	}
	allPicked := true
	for _, r := range m.centerRows {
		if r.kind != rowFile {
			continue
		}
		if !m.pickedFile[r.file] {
			allPicked = false
			break
		}
	}
	for _, r := range m.centerRows {
		if r.kind != rowFile {
			continue
		}
		if allPicked {
			delete(m.pickedFile, r.file)
		} else {
			m.pickedFile[r.file] = true
		}
	}
	return m, nil
}

func (m Model) onCommits(msg commitsMsg) (tea.Model, tea.Cmd) {
	m.loading = false
	m.progressDone = 0
	m.progressTotal = 0
	if m.applied != nil {
		_ = m.applied.Save()
	}
	m.commits = msg.commits
	m.items = make([]commitItem, len(m.commits))
	for i, c := range m.commits {
		m.items[i] = commitItem{commit: c, selected: false}
	}
	if m.mode == ModeOutgoing && msg.files != nil {
		m.outgoingFiles = msg.files
		m.outgoingPaths = msg.files["HEAD"]
		m.rebuildTree()
	}
	m.applyFilters()
	m.rebuildCenterRows()
	m.cursor = 0
	if m.pendingCursorHash != "" {
		for i, it := range m.items {
			if it.commit.Hash == m.pendingCursorHash {
				m.cursor = i
				break
			}
		}
		m.pendingCursorHash = ""
	}
	m.scrollOffset = 0
	if m.mode == ModeOutgoing {
		if len(m.outgoingPaths) == 0 {
			m.message = "No outgoing changes vs " + m.upstream
			return m, nil
		}
		m.message = ""
		if len(m.centerRows) > 0 {
			return m, m.loadDiffForRow(m.centerRows[0])
		}
		return m, nil
	}
	if len(m.items) == 0 {
		switch {
		case m.showIgnored:
			m.message = "No ignored commits."
		default:
			m.message = "All commits are already cherry-picked!"
		}
		return m, nil
	}
	return m, m.loadDiffCmd(m.items[m.cursor].commit.Hash)
}

// updatePrompt handles keystrokes while branch prompt is active
func (m Model) updatePrompt(msg tea.KeyMsg) (tea.Model, tea.Cmd) {
	switch msg.Type {
	case tea.KeyEsc:
		m.promptActive = false
		m.promptValue = ""
		return m, nil
	case tea.KeyEnter:
		name := strings.TrimSpace(m.promptValue)
		m.promptActive = false
		m.promptValue = ""
		if name == "" {
			m.message = errorStyle.Render("branch name required")
			return m, nil
		}
		if BranchExists(name) {
			m.message = errorStyle.Render(fmt.Sprintf("branch %s already exists", name))
			return m, nil
		}
		files := m.pickedFiles()
		m.loading = true
		m.migrating = true
		m.migratingBranch = name
		m.migratingCount = len(files)
		return m, applyFilesCmd(m.session, name, m.upstream, files)
	case tea.KeyBackspace:
		if len(m.promptValue) > 0 {
			m.promptValue = m.promptValue[:len(m.promptValue)-1]
		}
		return m, nil
	case tea.KeyRunes, tea.KeySpace:
		m.promptValue += string(msg.Runes)
		return m, nil
	}
	return m, nil
}

func (m *Model) cycleFocus() {
	if m.mode == ModeOutgoing {
		switch m.focus {
		case focusTree:
			m.focus = focusCommits
		case focusCommits:
			m.focus = focusDiff
		default:
			m.focus = focusTree
		}
		return
	}
	if m.focus == focusDiff {
		m.focus = focusCommits
	} else {
		m.focus = focusDiff
	}
}

func (m *Model) handleResize() {
	if m.width == 0 {
		return
	}
	if m.mode == ModeOutgoing {
		// Each framePanel uses RoundedBorder (1 col each side) => 2 cols overhead per panel.
		// Three panels => 6 cols of borders total. Reserve a few extra for safety.
		const borderCost = 8
		usable := m.width - borderCost
		if usable < 60 {
			usable = 60
		}
		m.leftWidth = int(float64(usable) * 0.25)
		m.centerWidth = int(float64(usable) * 0.25)
		m.rightWidth = usable - m.leftWidth - m.centerWidth
		if m.leftWidth < 18 {
			m.leftWidth = 18
		}
		if m.centerWidth < 30 {
			m.centerWidth = 30
		}
		if m.rightWidth < 25 {
			m.rightWidth = 25
		}
	} else {
		m.leftWidth = int(float64(m.width)*0.45) - 2
		m.rightWidth = m.width - m.leftWidth - 6
		m.centerWidth = 0
		if m.leftWidth < 30 {
			m.leftWidth = 30
		}
		if m.rightWidth < 40 {
			m.rightWidth = 40
		}
	}
}

func (m Model) handleIgnore() (tea.Model, tea.Cmd) {
	if m.cursor < 0 || m.cursor >= len(m.items) {
		return m, nil
	}
	hash := m.items[m.cursor].commit.Hash
	kind := KindIncoming
	if m.mode == ModeOutgoing {
		kind = KindOutgoing
	}
	if m.showIgnored {
		m.store.Remove(kind, hash)
		if m.mode == ModeOutgoing {
			m.store.Remove(KindMigrated, hash)
		}
	} else {
		m.store.Add(kind, hash)
	}
	if err := m.store.Save(); err != nil {
		m.message = errorStyle.Render(fmt.Sprintf("ignore save failed: %v", err))
		return m, nil
	}
	m.items = append(m.items[:m.cursor], m.items[m.cursor+1:]...)
	if m.cursor >= len(m.items) && m.cursor > 0 {
		m.cursor--
	}
	m.scrollOffset = 0
	if m.cursor < len(m.items) {
		return m, m.loadDiffCmd(m.items[m.cursor].commit.Hash)
	}
	return m, nil
}

// handleMarkApplied caches the current incoming commit as applied and hides it.
func (m Model) handleMarkApplied() (tea.Model, tea.Cmd) {
	if m.mode != ModeIncoming || m.showIgnored {
		return m, nil
	}
	if m.cursor < 0 || m.cursor >= len(m.items) {
		return m, nil
	}
	hash := m.items[m.cursor].commit.Hash
	m.applied.Mark(hash)
	if err := m.applied.Save(); err != nil {
		m.message = errorStyle.Render(fmt.Sprintf("save applied failed: %v", err))
		return m, nil
	}
	m.items = append(m.items[:m.cursor], m.items[m.cursor+1:]...)
	if m.cursor >= len(m.items) && m.cursor > 0 {
		m.cursor--
	}
	m.scrollOffset = 0
	m.message = successStyle.Render(fmt.Sprintf("✓ Marked applied %s (cached)", hash[:7]))
	if m.cursor < len(m.items) {
		return m, m.loadDiffCmd(m.items[m.cursor].commit.Hash)
	}
	return m, nil
}

// handleResetApplied clears the per-repo applied cache and reloads.
func (m Model) handleResetApplied() (tea.Model, tea.Cmd) {
	if err := m.applied.Clear(); err != nil {
		m.message = errorStyle.Render(fmt.Sprintf("reset applied failed: %v", err))
		return m, nil
	}
	m.loading = true
	m.message = successStyle.Render("✓ Applied cache reset")
	if m.cursor >= 0 && m.cursor < len(m.items) {
		m.pendingCursorHash = m.items[m.cursor].commit.Hash
	}
	return m, loadCommitsFor(m.mode, m.upstream, m.applied)
}

func (m Model) handleUp() (tea.Model, tea.Cmd) {
	switch m.focus {
	case focusDiff:
		if m.scrollOffset > 3 {
			m.scrollOffset -= 3
		} else {
			m.scrollOffset = 0
		}
	case focusTree:
		if m.treeCursor > 0 {
			m.treeCursor--
		}
	default:
		return m.moveCommits(-1)
	}
	return m, nil
}

func (m Model) handleDown() (tea.Model, tea.Cmd) {
	switch m.focus {
	case focusDiff:
		m.scrollOffset += 3
	case focusTree:
		if m.treeCursor < len(m.treeFlat)-1 {
			m.treeCursor++
		}
	default:
		return m.moveCommits(1)
	}
	return m, nil
}

func (m Model) handlePageUp() (tea.Model, tea.Cmd) {
	switch m.focus {
	case focusDiff:
		if m.scrollOffset > 10 {
			m.scrollOffset -= 10
		} else {
			m.scrollOffset = 0
		}
	case focusTree:
		m.treeCursor -= 5
		if m.treeCursor < 0 {
			m.treeCursor = 0
		}
	default:
		return m.moveCommits(-5)
	}
	return m, nil
}

func (m Model) handlePageDown() (tea.Model, tea.Cmd) {
	switch m.focus {
	case focusDiff:
		m.scrollOffset += 10
	case focusTree:
		m.treeCursor += 5
		if m.treeCursor >= len(m.treeFlat) {
			m.treeCursor = len(m.treeFlat) - 1
		}
	default:
		return m.moveCommits(5)
	}
	return m, nil
}

// moveCommits moves the active cursor in the central panel by delta lines and
// triggers diff loading for the new position.
func (m Model) moveCommits(delta int) (tea.Model, tea.Cmd) {
	if m.mode == ModeOutgoing {
		if len(m.centerRows) == 0 {
			return m, nil
		}
		m.centerCursor += delta
		if m.centerCursor < 0 {
			m.centerCursor = 0
		}
		if m.centerCursor >= len(m.centerRows) {
			m.centerCursor = len(m.centerRows) - 1
		}
		m.adjustCenterScroll()
		m.scrollOffset = 0
		r := m.currentCenterRow()
		m.currentDiff = ""
		m.currentDiffKey = ""
		if r.itemIdx >= 0 && r.itemIdx < len(m.items) {
			m.cursor = r.itemIdx
		}
		return m, m.loadDiffForRow(r)
	}
	if len(m.items) == 0 {
		return m, nil
	}
	m.cursor += delta
	if m.cursor < 0 {
		m.cursor = 0
	}
	if m.cursor >= len(m.items) {
		m.cursor = len(m.items) - 1
	}
	m.scrollOffset = 0
	m.currentDiff = ""
	m.currentDiffKey = ""
	return m, m.loadDiffCmd(m.items[m.cursor].commit.Hash)
}

// reapplyViewAfterFolder reruns filters starting from original commits list
func (m *Model) reapplyViewAfterFolder() {
	m.items = make([]commitItem, len(m.commits))
	for i, c := range m.commits {
		m.items[i] = commitItem{commit: c}
	}
	m.applyFilters()
	m.cursor = 0
}
