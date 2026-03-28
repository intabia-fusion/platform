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
	"github.com/charmbracelet/lipgloss"
)

var (
	// Styles
	titleStyle = lipgloss.NewStyle().
			Bold(true).
			Foreground(lipgloss.Color("#FAFAFA")).
			Background(lipgloss.Color("#7D56F4")).
			PaddingLeft(2).
			PaddingRight(2)

	panelStyle = lipgloss.NewStyle().
			Border(lipgloss.RoundedBorder()).
			BorderForeground(lipgloss.Color("#7D56F4"))

	leftPanelStyle = lipgloss.NewStyle().
			Border(lipgloss.RoundedBorder()).
			BorderForeground(lipgloss.Color("#7D56F4"))

	rightPanelStyle = lipgloss.NewStyle().
			Border(lipgloss.RoundedBorder()).
			BorderForeground(lipgloss.Color("#555555"))

	selectedItemStyle = lipgloss.NewStyle().
				Background(lipgloss.Color("#7D56F4")).
				Foreground(lipgloss.Color("#FFFFFF"))

	cherryPickedStyle = lipgloss.NewStyle().
				Foreground(lipgloss.Color("#50C878"))

	errorStyle = lipgloss.NewStyle().
			Foreground(lipgloss.Color("#FF6B6B"))

	successStyle = lipgloss.NewStyle().
			Foreground(lipgloss.Color("#50C878"))

	infoStyle = lipgloss.NewStyle().
			Foreground(lipgloss.Color("#888888"))

	headerStyle = lipgloss.NewStyle().
			Bold(true).
			Foreground(lipgloss.Color("#7D56F4"))

	diffAddStyle = lipgloss.NewStyle().
			Foreground(lipgloss.Color("#50C878"))

	diffRemoveStyle = lipgloss.NewStyle().
			Foreground(lipgloss.Color("#FF6B6B"))

	diffHeaderStyle = lipgloss.NewStyle().
			Foreground(lipgloss.Color("#7D56F4"))
)

// KeyMap defines keybindings
type KeyMap struct {
	Up         key.Binding
	Down       key.Binding
	Toggle     key.Binding
	ToggleAll  key.Binding
	CherryPick key.Binding
	Refresh    key.Binding
	PageUp     key.Binding
	PageDown   key.Binding
	Tab        key.Binding
	Quit       key.Binding
	Help       key.Binding
}

// DefaultKeyMap returns default keybindings
func DefaultKeyMap() KeyMap {
	return KeyMap{
		Up: key.NewBinding(
			key.WithKeys("up", "k"),
			key.WithHelp("↑/k", "up"),
		),
		Down: key.NewBinding(
			key.WithKeys("down", "j"),
			key.WithHelp("↓/j", "down"),
		),
		Toggle: key.NewBinding(
			key.WithKeys(" ", "enter"),
			key.WithHelp("space/enter", "toggle"),
		),
		ToggleAll: key.NewBinding(
			key.WithKeys("a"),
			key.WithHelp("a", "toggle all"),
		),
		CherryPick: key.NewBinding(
			key.WithKeys("c"),
			key.WithHelp("c", "cherry-pick"),
		),
		Refresh: key.NewBinding(
			key.WithKeys("r"),
			key.WithHelp("r", "refresh"),
		),
		PageUp: key.NewBinding(
			key.WithKeys("pgup", "K"),
			key.WithHelp("pgup/K", "page up"),
		),
		PageDown: key.NewBinding(
			key.WithKeys("pgdown", "J"),
			key.WithHelp("pgdown/J", "page down"),
		),
		Quit: key.NewBinding(
			key.WithKeys("q", "esc", "ctrl+c"),
			key.WithHelp("q/esc", "quit"),
		),
		Help: key.NewBinding(
			key.WithKeys("?"),
			key.WithHelp("?", "help"),
		),
		Tab: key.NewBinding(
			key.WithKeys("tab"),
			key.WithHelp("tab", "switch focus"),
		),
	}
}

// commitItem wraps Commit for display
type commitItem struct {
	commit   Commit
	selected bool
}

// Model is the application model
type Model struct {
	keys          KeyMap
	commits       []Commit
	items         []commitItem
	upstream      string
	currentBranch string
	loading       bool
	err           error
	message       string
	showHelp      bool
	width         int
	height        int
	cursor        int  // Current position in commit list
	scrollOffset  int  // Scroll offset for right panel
	leftWidth     int  // Width of left panel
	rightWidth    int  // Width of right panel
	focusRight    bool // Focus is on right panel (for scrolling)
}

// Init initializes the model
func (m Model) Init() tea.Cmd {
	return tea.Batch(
		loadCommits(m.upstream),
		tea.EnterAltScreen,
	)
}

// initialModel creates a new model
func initialModel() Model {
	return initialModelWithBranch("upstream/develop")
}

// initialModelWithBranch creates a new model with specified upstream branch
func initialModelWithBranch(upstreamBranch string) Model {
	// Try to get current branch
	currentBranch, _ := GetCurrentBranch()

	return Model{
		keys:          DefaultKeyMap(),
		upstream:      upstreamBranch,
		currentBranch: currentBranch,
		loading:       true,
		commits:       []Commit{},
		items:         []commitItem{},
		cursor:        0,
		scrollOffset:  0,
		focusRight:    false,
	}
}

// Update handles messages
func (m Model) Update(msg tea.Msg) (tea.Model, tea.Cmd) {
	switch msg := msg.(type) {
	case tea.WindowSizeMsg:
		m.width = msg.Width
		m.height = msg.Height
		// Calculate panel widths (45% left, 55% right) - reserve space for borders
		m.leftWidth = int(float64(msg.Width)*0.45) - 2
		m.rightWidth = msg.Width - m.leftWidth - 6 // -6 for borders and spacing
		// Ensure minimum widths
		if m.leftWidth < 30 {
			m.leftWidth = 30
		}
		if m.rightWidth < 40 {
			m.rightWidth = 40
		}
		return m, nil

	case tea.KeyMsg:
		switch {
		case key.Matches(msg, m.keys.Quit):
			return m, tea.Quit

		case key.Matches(msg, m.keys.Help):
			m.showHelp = !m.showHelp
			return m, nil

		case key.Matches(msg, m.keys.Refresh):
			m.loading = true
			m.message = ""
			return m, loadCommits(m.upstream)

		case key.Matches(msg, m.keys.Tab):
			m.focusRight = !m.focusRight
			return m, nil

		case key.Matches(msg, m.keys.Up):
			if m.focusRight {
				// Scroll diff up in right panel
				if m.scrollOffset > 3 {
					m.scrollOffset -= 3
				} else {
					m.scrollOffset = 0
				}
			} else {
				// Navigate up in left panel (select previous commit)
				if m.cursor > 0 {
					m.cursor--
					m.scrollOffset = 0
					if m.cursor < len(m.items) {
						return m, loadDiff(m.items[m.cursor].commit.Hash)
					}
				}
			}
			return m, nil

		case key.Matches(msg, m.keys.Down):
			if m.focusRight {
				// Scroll diff down in right panel
				m.scrollOffset += 3
			} else {
				// Navigate down in left panel (select next commit)
				if m.cursor < len(m.items)-1 {
					m.cursor++
					m.scrollOffset = 0
					if m.cursor < len(m.items) {
						return m, loadDiff(m.items[m.cursor].commit.Hash)
					}
				}
			}
			return m, nil

		case key.Matches(msg, m.keys.PageUp):
			if m.focusRight {
				// Scroll diff up faster in right panel
				if m.scrollOffset > 10 {
					m.scrollOffset -= 10
				} else {
					m.scrollOffset = 0
				}
			} else {
				// Page up in left panel (jump 5 commits up)
				if m.cursor > 0 {
					m.cursor -= 5
					if m.cursor < 0 {
						m.cursor = 0
					}
					m.scrollOffset = 0
					if m.cursor < len(m.items) {
						return m, loadDiff(m.items[m.cursor].commit.Hash)
					}
				}
			}
			return m, nil

		case key.Matches(msg, m.keys.PageDown):
			if m.focusRight {
				// Scroll diff down faster in right panel
				m.scrollOffset += 10
			} else {
				// Page down in left panel (jump 5 commits down)
				if m.cursor < len(m.items)-1 {
					m.cursor += 5
					if m.cursor >= len(m.items) {
						m.cursor = len(m.items) - 1
					}
					m.scrollOffset = 0
					if m.cursor < len(m.items) {
						return m, loadDiff(m.items[m.cursor].commit.Hash)
					}
				}
			}
			return m, nil

		case key.Matches(msg, m.keys.Toggle):
			if m.cursor >= 0 && m.cursor < len(m.items) {
				m.items[m.cursor].selected = !m.items[m.cursor].selected
			}
			return m, nil

		case key.Matches(msg, m.keys.ToggleAll):
			// Check if all are selected
			allSelected := true
			for _, item := range m.items {
				if !item.selected {
					allSelected = false
					break
				}
			}
			// Toggle all
			for i := range m.items {
				m.items[i].selected = !allSelected
			}
			return m, nil

		case key.Matches(msg, m.keys.CherryPick):
			return m, m.cherryPickSelected()
		}

	case commitsMsg:
		m.loading = false
		m.commits = msg.commits
		m.items = make([]commitItem, len(m.commits))
		for i, c := range m.commits {
			m.items[i] = commitItem{commit: c, selected: false}
		}
		// Filter to show only missing commits
		m.items = filterMissingCommits(m.items)
		m.cursor = 0
		m.scrollOffset = 0
		if len(m.items) == 0 {
			m.message = "All commits are already cherry-picked!"
		} else {
			// Load diff for first commit
			return m, loadDiff(m.items[0].commit.Hash)
		}
		return m, nil

	case errorMsg:
		m.loading = false
		m.err = msg.err
		m.message = fmt.Sprintf("Error: %v", msg.err)
		return m, nil

	case diffMsg:
		// Update diff for the commit
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
			// Refresh the list
			return m, loadCommits(m.upstream)
		} else {
			m.message = errorStyle.Render(fmt.Sprintf("✗ Failed: %v", msg.err))
		}
		return m, nil
	}

	return m, nil
}

// View renders the UI
func (m Model) View() string {
	if m.loading {
		return fmt.Sprintf("\n\n  %s Loading commits from %s...\n",
			lipgloss.NewStyle().Foreground(lipgloss.Color("#7D56F4")).Render("◉"),
			m.upstream)
	}

	var b strings.Builder

	// Title (single line, compact)
	b.WriteString(titleStyle.Render(fmt.Sprintf(" Cherry-Pick: %s → %s ",
		m.upstream, m.currentBranch)))
	b.WriteString("\n")

	// Stats - single line, compact
	selectedCount := 0
	for _, item := range m.items {
		if item.selected {
			selectedCount++
		}
	}
	stats := fmt.Sprintf("Missing: %d | Selected: %d | Tab: switch focus | ?: help | q: quit",
		len(m.items), selectedCount)
	b.WriteString(infoStyle.Render(stats))
	b.WriteString("\n")

	// Two panels - render with focus styling
	leftPanel := m.renderLeftPanel(!m.focusRight)
	rightPanel := m.renderRightPanel(m.focusRight)

	// Render panels side by side
	panels := lipgloss.JoinHorizontal(lipgloss.Top, leftPanel, rightPanel)
	b.WriteString(panels)
	b.WriteString("\n")

	// Message
	if m.message != "" {
		b.WriteString(m.message)
		b.WriteString("\n")
	}

	// Help
	if m.showHelp {
		b.WriteString("\n")
		b.WriteString(m.helpView())
	} else {
		// Status line already shown above
	}

	return b.String()
}

func (m Model) renderLeftPanel(focused bool) string {
	var b strings.Builder

	b.WriteString(headerStyle.Render(" Commits "))
	b.WriteString("\n")

	if len(m.items) == 0 {
		b.WriteString(infoStyle.Render("No commits found"))
	} else {
		// Calculate available height based on panel height
		// Panel height is m.height - 7, minus 2 for borders, minus 1 for "Commits" header
		availableHeight := m.height - 10
		if availableHeight < 4 {
			availableHeight = 4
		}

		// Each commit takes 2 lines (hash line + info line)
		visibleCount := availableHeight / 2
		if visibleCount < 1 {
			visibleCount = 1
		}

		// Calculate scroll window to keep cursor in middle when possible
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
			item := m.items[i]
			line := m.renderCommitItem(item, i == m.cursor)
			b.WriteString(line)
			b.WriteString("\n") // Add blank line between commits for separation
		}
	}

	content := b.String()
	// Reserve space for: title (1) + status (1) + message (1) + help (1) + padding (2)
	panelHeight := m.height - 7
	if panelHeight < 6 {
		panelHeight = 6
	}

	// Apply focus styling
	style := leftPanelStyle.Width(m.leftWidth).Height(panelHeight)
	if focused {
		style = style.BorderForeground(lipgloss.Color("#7D56F4"))
	} else {
		style = style.BorderForeground(lipgloss.Color("#555555"))
	}
	return style.Render(content)
}

func (m Model) renderCommitItem(item commitItem, isSelected bool) string {
	commit := item.commit

	// Checkbox
	checkbox := "[ ]"
	if item.selected {
		checkbox = "[x]"
	}

	// Format lines - compact 2-line display (no cherry-picked indicator since we filter them out)
	hash := commit.ShortHash

	// Truncate subject to fit
	maxSubjectLen := m.leftWidth - 15
	if maxSubjectLen < 10 {
		maxSubjectLen = 10
	}
	subject := truncate(commit.Subject, maxSubjectLen)

	// Info line
	info := fmt.Sprintf("%s • %s", truncate(commit.Author, 15), commit.Date)

	// Add conflict indicator
	if commit.HasConflict {
		info = "⚠ CONFLICT | " + info
	}

	if isSelected {
		line1 := fmt.Sprintf("%s %s", checkbox, hash)
		line2 := truncate(subject+" | "+info, m.leftWidth-4)
		return selectedItemStyle.Render(line1 + "\n" + line2)
	}

	if commit.HasConflict {
		line1 := fmt.Sprintf("%s %s", checkbox, hash)
		line2 := errorStyle.Render(truncate(subject+" | "+info, m.leftWidth-4))
		return line1 + "\n" + line2
	}

	line1 := fmt.Sprintf("%s %s", checkbox, hash)
	line2 := infoStyle.Render(truncate(subject+" | "+info, m.leftWidth-4))
	return line1 + "\n" + line2
}

func (m Model) renderRightPanel(focused bool) string {
	var b strings.Builder

	b.WriteString(headerStyle.Render(" Diff "))
	b.WriteString("\n")

	if m.cursor >= 0 && m.cursor < len(m.items) {
		commit := m.items[m.cursor].commit

		// Commit info (compact)
		b.WriteString(fmt.Sprintf("%s | %s | %s\n", commit.ShortHash, commit.Author, commit.Date))
		b.WriteString(truncate(commit.Subject, m.rightWidth-4))
		b.WriteString("\n")
		b.WriteString(strings.Repeat("─", m.rightWidth-4))
		b.WriteString("\n")

		// Diff
		if commit.Diff != "" {
			diffLines := strings.Split(commit.Diff, "\n")
			// Calculate available lines for diff
			availableHeight := m.height - 12
			if availableHeight < 5 {
				availableHeight = 5
			}
			visibleLines := availableHeight

			start := m.scrollOffset
			if start >= len(diffLines) {
				start = len(diffLines) - 1
			}
			if start < 0 {
				start = 0
			}
			end := start + visibleLines
			if end > len(diffLines) {
				end = len(diffLines)
			}

			for _, line := range diffLines[start:end] {
				// Truncate long lines
				if len(line) > m.rightWidth-4 {
					line = line[:m.rightWidth-7] + "..."
				}
				styledLine := m.styleDiffLine(line)
				b.WriteString(styledLine)
				b.WriteString("\n")
			}

			if end < len(diffLines) {
				b.WriteString(infoStyle.Render(fmt.Sprintf("... (%d more lines, PgUp/PgDn to scroll)", len(diffLines)-end)))
			}
		} else {
			b.WriteString(infoStyle.Render("Loading diff..."))
		}
	} else {
		b.WriteString(infoStyle.Render("No commit selected"))
	}

	content := b.String()
	// Reserve space for: title (1) + status (1) + message (1) + help (1) + padding (3)
	panelHeight := m.height - 8
	if panelHeight < 6 {
		panelHeight = 6
	}

	// Apply focus styling
	style := rightPanelStyle.Width(m.rightWidth).Height(panelHeight)
	if focused {
		style = style.BorderForeground(lipgloss.Color("#7D56F4"))
	} else {
		style = style.BorderForeground(lipgloss.Color("#555555"))
	}
	return style.Render(content)
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

func (m Model) helpView() string {
	var b strings.Builder
	b.WriteString("Keyboard shortcuts:\n")
	b.WriteString("  ↑/k     - Move up (left panel)\n")
	b.WriteString("  ↓/j     - Move down (left panel)\n")
	b.WriteString("  PgUp    - Scroll up\n")
	b.WriteString("  PgDn    - Scroll down\n")
	b.WriteString("  Tab     - Switch focus (left/right panel)\n")
	b.WriteString("  Space   - Toggle selection\n")
	b.WriteString("  a       - Toggle all\n")
	b.WriteString("  c       - Cherry-pick selected\n")
	b.WriteString("  r       - Refresh commits\n")
	b.WriteString("  ?       - Toggle help\n")
	b.WriteString("  q/esc   - Quit\n")
	return b.String()
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
		// Check if there's already a cherry-pick in progress
		if HasCherryPickInProgress() {
			// Abort the previous cherry-pick
			if err := AbortCherryPick(); err != nil {
				return cherryPickResultMsg{success: false, hash: "", err: fmt.Errorf("failed to abort previous cherry-pick: %v", err)}
			}
		}

		// Cherry-pick commits in order (oldest first)
		for i := len(selected) - 1; i >= 0; i-- {
			commit := selected[i]
			if err := CherryPick(commit.Hash); err != nil {
				return cherryPickResultMsg{success: false, hash: commit.Hash, err: err}
			}
		}
		return cherryPickResultMsg{success: true, hash: selected[0].Hash}
	}
}

func countCherryPicked(commits []Commit) int {
	count := 0
	for _, c := range commits {
		if c.CherryPicked {
			count++
		}
	}
	return count
}

// filterMissingCommits returns only commits that are not cherry-picked
func filterMissingCommits(items []commitItem) []commitItem {
	var filtered []commitItem
	for _, item := range items {
		if !item.commit.CherryPicked {
			filtered = append(filtered, item)
		}
	}
	return filtered
}

func truncate(s string, maxLen int) string {
	if len(s) <= maxLen {
		return s
	}
	return s[:maxLen-3] + "..."
}

// Messages
type commitsMsg struct {
	commits []Commit
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

// Commands
func loadCommits(upstream string) tea.Cmd {
	return func() tea.Msg {
		commits, err := GetCommitsFromUpstream(upstream)
		if err != nil {
			return errorMsg{err: err}
		}

		commits, err = CheckCherryPicked(commits, upstream)
		if err != nil {
			return errorMsg{err: err}
		}

		return commitsMsg{commits: commits}
	}
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
