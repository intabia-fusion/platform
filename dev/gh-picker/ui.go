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
	"time"

	"github.com/charmbracelet/bubbles/key"
	tea "github.com/charmbracelet/bubbletea"
	"github.com/charmbracelet/lipgloss"
)

// Styles shared across panels
var (
	titleStyle = lipgloss.NewStyle().
			Bold(true).
			Foreground(lipgloss.Color("#FAFAFA")).
			Background(lipgloss.Color("#7D56F4")).
			PaddingLeft(2).
			PaddingRight(2)

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

	partialStyle = lipgloss.NewStyle().
			Foreground(lipgloss.Color("#E5C07B"))

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
	Up          key.Binding
	Down        key.Binding
	Toggle      key.Binding
	ToggleAll   key.Binding
	CherryPick  key.Binding
	Refresh     key.Binding
	PageUp      key.Binding
	PageDown    key.Binding
	Tab         key.Binding
	Quit        key.Binding
	Help        key.Binding
	Ignore      key.Binding
	ShowIgnored key.Binding
	Mode        key.Binding
	Migrate     key.Binding
	Left        key.Binding
	Right       key.Binding
}

// DefaultKeyMap returns default keybindings
func DefaultKeyMap() KeyMap {
	return KeyMap{
		Up:          key.NewBinding(key.WithKeys("up", "k"), key.WithHelp("↑/k", "up")),
		Down:        key.NewBinding(key.WithKeys("down", "j"), key.WithHelp("↓/j", "down")),
		Toggle:      key.NewBinding(key.WithKeys(" ", "enter"), key.WithHelp("space/enter", "toggle")),
		ToggleAll:   key.NewBinding(key.WithKeys("a"), key.WithHelp("a", "toggle all")),
		CherryPick:  key.NewBinding(key.WithKeys("c"), key.WithHelp("c", "cherry-pick")),
		Refresh:     key.NewBinding(key.WithKeys("r"), key.WithHelp("r", "refresh")),
		PageUp:      key.NewBinding(key.WithKeys("pgup", "K"), key.WithHelp("pgup/K", "page up")),
		PageDown:    key.NewBinding(key.WithKeys("pgdown", "J"), key.WithHelp("pgdown/J", "page down")),
		Quit:        key.NewBinding(key.WithKeys("q", "esc", "ctrl+c"), key.WithHelp("q/esc", "quit")),
		Help:        key.NewBinding(key.WithKeys("?"), key.WithHelp("?", "help")),
		Tab:         key.NewBinding(key.WithKeys("tab"), key.WithHelp("tab", "switch focus")),
		Ignore:      key.NewBinding(key.WithKeys("x"), key.WithHelp("x", "ignore commit")),
		ShowIgnored: key.NewBinding(key.WithKeys("i"), key.WithHelp("i", "toggle ignored view")),
		Mode:        key.NewBinding(key.WithKeys("o"), key.WithHelp("o", "toggle incoming/outgoing")),
		Migrate:     key.NewBinding(key.WithKeys("m"), key.WithHelp("m", "migrate selected to new branch")),
		Left:        key.NewBinding(key.WithKeys("left", "h"), key.WithHelp("←/h", "focus tree")),
		Right:       key.NewBinding(key.WithKeys("right", "l"), key.WithHelp("→/l", "focus commits")),
	}
}

// commitItem wraps Commit for display
type commitItem struct {
	commit   Commit
	selected bool
}

// focusArea tracks which panel captures navigation keys
type focusArea int

const (
	focusCommits focusArea = iota
	focusDiff
	focusTree
)

// AppMode = direction of cherry-pick
type AppMode int

const (
	ModeIncoming AppMode = iota // upstream -> HEAD (default)
	ModeOutgoing                // HEAD -> upstream
)

// Model is the application model
type Model struct {
	keys              KeyMap
	commits           []Commit
	items             []commitItem
	allOutgoing       []Commit
	outgoingFiles     map[string][]string
	tree              *treeNode
	treeFlat          []*treeNode
	treeCursor        int
	treeExpanded      map[string]bool
	selectedFolder    string
	upstream          string
	currentBranch     string
	loading           bool
	err               error
	message           string
	showHelp          bool
	width             int
	height            int
	cursor            int
	scrollOffset      int
	leftWidth         int
	rightWidth        int
	centerWidth       int
	focus             focusArea
	mode              AppMode
	store             *IgnoreStore
	showIgnored       bool
	pendingCursorHash string
	promptActive      bool
	promptValue       string
	progressDone      int
	progressTotal     int
	progressStarted   time.Time
	migrating         bool
	migratingBranch   string
	migratingCount    int
}

// Init initializes the model
func (m Model) Init() tea.Cmd {
	return tea.Batch(
		loadCommitsFor(m.mode, m.upstream),
		tea.EnterAltScreen,
	)
}

// initialModel creates a new model
func initialModel() Model {
	return initialModelWithBranch("upstream/develop")
}

// initialModelWithBranch creates a new model with specified upstream branch
func initialModelWithBranch(upstreamBranch string) Model {
	currentBranch, _ := GetCurrentBranch()
	store, _ := LoadIgnoreStore()
	if store == nil {
		store = NewIgnoreStore()
	}
	return Model{
		keys:          DefaultKeyMap(),
		upstream:      upstreamBranch,
		currentBranch: currentBranch,
		loading:       true,
		commits:       []Commit{},
		items:         []commitItem{},
		focus:         focusCommits,
		store:         store,
		mode:          ModeIncoming,
		outgoingFiles: map[string][]string{},
		treeExpanded:  map[string]bool{},
	}
}
