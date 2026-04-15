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
	"time"

	"github.com/charmbracelet/lipgloss"
)

// View renders the UI
func (m Model) View() string {
	if m.loading {
		spin := lipgloss.NewStyle().Foreground(lipgloss.Color("#7D56F4")).Render("◉")
		progress := m.renderProgress()
		return fmt.Sprintf("\n\n  %s Loading commits from %s...\n%s\n", spin, m.upstream, progress)
	}

	var b strings.Builder
	b.WriteString(m.renderTitle())
	b.WriteString("\n")
	b.WriteString(m.renderStats())
	b.WriteString("\n")
	b.WriteString(m.renderPanels())
	b.WriteString("\n")

	if m.promptActive {
		b.WriteString(headerStyle.Render("New branch name (Enter to create, Esc to cancel): "))
		b.WriteString(m.promptValue + "_")
		b.WriteString("\n")
	}
	if m.message != "" {
		b.WriteString(m.message)
		b.WriteString("\n")
	}
	if m.showHelp {
		b.WriteString("\n")
		b.WriteString(m.helpView())
	}
	return b.String()
}

func (m Model) renderTitle() string {
	modeLabel := "Incoming"
	title := fmt.Sprintf(" Cherry-Pick [%s]: %s → %s ", modeLabel, m.upstream, m.currentBranch)
	if m.mode == ModeOutgoing {
		modeLabel = "Outgoing"
		title = fmt.Sprintf(" Cherry-Pick [%s]: %s → %s ", modeLabel, m.currentBranch, m.upstream)
	}
	return titleStyle.Render(title)
}

func (m Model) renderStats() string {
	view := "list"
	if m.showIgnored {
		view = "ignored"
	}
	selectedCount := 0
	for _, item := range m.items {
		if item.selected {
			selectedCount++
		}
	}
	var stats string
	if m.mode == ModeOutgoing {
		stats = fmt.Sprintf("view:%s | shown:%d | sel:%d | folder:%s | ignored:%d | migrated:%d | o:mode x:ign i:view m:migrate ?",
			view, len(m.items), selectedCount,
			displayFolder(m.selectedFolder), len(m.store.Outgoing), len(m.store.Migrated))
	} else {
		stats = fmt.Sprintf("view:%s | shown:%d | sel:%d | ignored:%d | o:mode x:ign i:view c:cherry-pick ?",
			view, len(m.items), selectedCount, len(m.store.Incoming))
	}
	return infoStyle.Render(stats)
}

func (m Model) renderPanels() string {
	if m.mode == ModeOutgoing {
		tree := m.renderTreePanel(m.focus == focusTree)
		commits := m.renderCommitsPanel(m.focus == focusCommits, m.centerWidth)
		diff := m.renderDiffPanel(m.focus == focusDiff, m.rightWidth)
		return lipgloss.JoinHorizontal(lipgloss.Top, tree, commits, diff)
	}
	commits := m.renderCommitsPanel(m.focus != focusDiff, m.leftWidth)
	diff := m.renderDiffPanel(m.focus == focusDiff, m.rightWidth)
	return lipgloss.JoinHorizontal(lipgloss.Top, commits, diff)
}

func (m Model) renderProgress() string {
	if m.progressTotal <= 0 {
		return ""
	}
	done, total := m.progressDone, m.progressTotal
	pct := float64(done) / float64(total) * 100
	elapsed := time.Since(m.progressStarted)
	var eta time.Duration
	if done > 0 {
		eta = time.Duration(float64(elapsed) / float64(done) * float64(total-done))
	}
	barWidth := 30
	filled := barWidth * done / total
	if filled > barWidth {
		filled = barWidth
	}
	bar := strings.Repeat("█", filled) + strings.Repeat("░", barWidth-filled)
	line := fmt.Sprintf("  [%s] %d/%d (%.0f%%)  elapsed %s  ETA %s",
		bar, done, total, pct, fmtDuration(elapsed), fmtDuration(eta))
	return infoStyle.Render(line)
}

func fmtDuration(d time.Duration) string {
	if d < time.Second {
		return fmt.Sprintf("%dms", d.Milliseconds())
	}
	if d < time.Minute {
		return fmt.Sprintf("%.1fs", d.Seconds())
	}
	return fmt.Sprintf("%dm%02ds", int(d.Minutes()), int(d.Seconds())%60)
}

func displayFolder(p string) string {
	if p == "" {
		return "<all>"
	}
	return p
}

func (m Model) renderTreePanel(focused bool) string {
	var b strings.Builder
	b.WriteString(headerStyle.Render(" Folders "))
	b.WriteString("\n")

	availableHeight := m.height - 10
	if availableHeight < 4 {
		availableHeight = 4
	}
	start := 0
	if m.treeCursor >= availableHeight {
		start = m.treeCursor - availableHeight/2
		if start > len(m.treeFlat)-availableHeight {
			start = len(m.treeFlat) - availableHeight
		}
	}
	if start < 0 {
		start = 0
	}
	end := start + availableHeight
	if end > len(m.treeFlat) {
		end = len(m.treeFlat)
	}

	for i := start; i < end; i++ {
		n := m.treeFlat[i]
		indent := strings.Repeat("  ", n.depth)
		label := n.name
		if n.path == "" {
			label = "<all>"
		}
		marker := "  "
		if len(n.children) > 0 {
			if n.expanded {
				marker = "▼ "
			} else {
				marker = "▶ "
			}
		}
		line := fmt.Sprintf("%s%s%s (%d)", indent, marker, label, len(n.commitHashes))
		line = truncate(line, m.leftWidth-4)
		if i == m.treeCursor {
			line = selectedItemStyle.Render(line)
		} else if n.path == m.selectedFolder {
			line = cherryPickedStyle.Render(line)
		}
		b.WriteString(line)
		b.WriteString("\n")
	}

	return framePanel(b.String(), m.leftWidth, m.height-7, focused)
}

func (m Model) renderCommitsPanel(focused bool, width int) string {
	var b strings.Builder
	b.WriteString(headerStyle.Render(" Commits "))
	b.WriteString("\n")

	if len(m.items) == 0 {
		b.WriteString(infoStyle.Render("No commits"))
	} else {
		availableHeight := m.height - 10
		if availableHeight < 4 {
			availableHeight = 4
		}
		visibleCount := availableHeight / 2
		if visibleCount < 1 {
			visibleCount = 1
		}
		start := 0
		if m.cursor >= visibleCount {
			start = m.cursor - visibleCount/2
			if start > len(m.items)-visibleCount {
				start = len(m.items) - visibleCount
			}
		}
		if start < 0 {
			start = 0
		}
		end := start + visibleCount
		if end > len(m.items) {
			end = len(m.items)
		}
		for i := start; i < end; i++ {
			b.WriteString(m.renderCommitItemW(m.items[i], i == m.cursor, width))
			b.WriteString("\n")
		}
	}
	return framePanel(b.String(), width, m.height-7, focused)
}

func (m Model) renderCommitItemW(item commitItem, isSelected bool, width int) string {
	commit := item.commit
	checkbox := "[ ]"
	if item.selected {
		checkbox = "[x]"
	}
	marker := ""
	if m.mode == ModeOutgoing && m.store.Has(KindMigrated, commit.Hash) {
		marker = "[M] "
	}
	hash := commit.ShortHash
	if hash == "" && len(commit.Hash) >= 8 {
		hash = commit.Hash[:8]
	}
	maxSubjectLen := width - 20
	if maxSubjectLen < 10 {
		maxSubjectLen = 10
	}
	subject := truncate(commit.Subject, maxSubjectLen)
	info := fmt.Sprintf("%s • %s", truncate(commit.Author, 15), commit.Date)
	if commit.HasConflict {
		info = "⚠ CONFLICT | " + info
	}
	line1 := fmt.Sprintf("%s %s%s", checkbox, marker, hash)
	line2 := truncate(subject+" | "+info, width-4)
	if isSelected {
		return selectedItemStyle.Render(line1 + "\n" + line2)
	}
	if commit.HasConflict {
		return line1 + "\n" + errorStyle.Render(line2)
	}
	return line1 + "\n" + infoStyle.Render(line2)
}

func (m Model) renderDiffPanel(focused bool, width int) string {
	var b strings.Builder
	b.WriteString(headerStyle.Render(" Diff "))
	b.WriteString("\n")

	if m.cursor >= 0 && m.cursor < len(m.items) {
		commit := m.items[m.cursor].commit
		b.WriteString(fmt.Sprintf("%s | %s | %s\n", commit.ShortHash, commit.Author, commit.Date))
		b.WriteString(truncate(commit.Subject, width-4))
		b.WriteString("\n")
		b.WriteString(strings.Repeat("─", width-4))
		b.WriteString("\n")

		if commit.Diff != "" {
			diffLines := strings.Split(commit.Diff, "\n")
			availableHeight := m.height - 12
			if availableHeight < 5 {
				availableHeight = 5
			}
			start := m.scrollOffset
			if start >= len(diffLines) {
				start = len(diffLines) - 1
			}
			if start < 0 {
				start = 0
			}
			end := start + availableHeight
			if end > len(diffLines) {
				end = len(diffLines)
			}
			for _, line := range diffLines[start:end] {
				if len(line) > width-4 {
					line = line[:width-7] + "..."
				}
				b.WriteString(m.styleDiffLine(line))
				b.WriteString("\n")
			}
			if end < len(diffLines) {
				b.WriteString(infoStyle.Render(fmt.Sprintf("... (%d more, PgUp/PgDn)", len(diffLines)-end)))
			}
		} else {
			b.WriteString(infoStyle.Render("Loading diff..."))
		}
	} else {
		b.WriteString(infoStyle.Render("No commit selected"))
	}
	return framePanel(b.String(), width, m.height-8, focused)
}

func (m Model) styleDiffLine(line string) string {
	if strings.HasPrefix(line, "+") && !strings.HasPrefix(line, "+++") {
		return diffAddStyle.Render(line)
	}
	if strings.HasPrefix(line, "-") && !strings.HasPrefix(line, "---") {
		return diffRemoveStyle.Render(line)
	}
	if strings.HasPrefix(line, "@@") {
		return diffHeaderStyle.Render(line)
	}
	if strings.HasPrefix(line, "diff --git") || strings.HasPrefix(line, "index ") ||
		strings.HasPrefix(line, "--- ") || strings.HasPrefix(line, "+++ ") {
		return diffHeaderStyle.Render(line)
	}
	return line
}

func framePanel(content string, width, height int, focused bool) string {
	if height < 6 {
		height = 6
	}
	style := leftPanelStyle.Width(width).Height(height)
	if focused {
		style = style.BorderForeground(lipgloss.Color("#7D56F4"))
	} else {
		style = style.BorderForeground(lipgloss.Color("#555555"))
	}
	return style.Render(content)
}

func (m Model) helpView() string {
	var b strings.Builder
	b.WriteString("Keyboard shortcuts:\n")
	b.WriteString("  ↑/k ↓/j     - Navigate\n")
	b.WriteString("  ←/h →/l     - Focus tree / commits (outgoing)\n")
	b.WriteString("  PgUp/PgDn   - Scroll\n")
	b.WriteString("  Tab         - Cycle focus\n")
	b.WriteString("  Space/Enter - Toggle selection (commits) / expand+pick folder (tree)\n")
	b.WriteString("  a           - Toggle all\n")
	b.WriteString("  c           - Cherry-pick selected (incoming)\n")
	b.WriteString("  m           - Migrate selected to new branch (outgoing)\n")
	b.WriteString("  o           - Toggle incoming/outgoing mode\n")
	b.WriteString("  r           - Refresh\n")
	b.WriteString("  x           - Ignore commit (or unignore in ignored view)\n")
	b.WriteString("  i           - Toggle view between active and ignored\n")
	b.WriteString("  ?           - Toggle help\n")
	b.WriteString("  q/esc       - Quit\n")
	return b.String()
}

func truncate(s string, maxLen int) string {
	if len(s) <= maxLen {
		return s
	}
	if maxLen < 3 {
		return s[:maxLen]
	}
	return s[:maxLen-3] + "..."
}
