// Copyright © 2026 Intabia Fusion.
// Licensed under the Eclipse Public License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License. You may
// obtain a copy of the License at https://www.eclipse.org/legal/epl-2.0

package main

import (
	"sort"
	"strings"
)

// rebuildCenterRows builds central rows:
//   - outgoing: one rowFile per file (filtered by selectedFolder), alphabetical
//   - incoming: one rowCommit per item
func (m *Model) rebuildCenterRows() {
	prevFile, prevHash := "", ""
	if m.centerCursor >= 0 && m.centerCursor < len(m.centerRows) {
		r := m.centerRows[m.centerCursor]
		prevFile = r.file
		if r.itemIdx >= 0 && r.itemIdx < len(m.items) {
			prevHash = m.items[r.itemIdx].commit.Hash
		}
	}

	rows := make([]centerRow, 0, len(m.items))
	if m.mode != ModeOutgoing {
		for i := range m.items {
			rows = append(rows, centerRow{kind: rowCommit, itemIdx: i})
		}
	} else {
		files := m.filteredOutgoingFiles()
		for _, f := range files {
			rows = append(rows, centerRow{kind: rowFile, file: f, itemIdx: -1})
		}
	}
	m.centerRows = rows
	m.centerCursor = 0
	m.centerScroll = 0
	if prevFile != "" {
		for idx, r := range rows {
			if r.file == prevFile {
				m.centerCursor = idx
				m.adjustCenterScroll()
				return
			}
		}
	}
	if prevHash != "" {
		for idx, r := range rows {
			if r.itemIdx >= 0 && r.itemIdx < len(m.items) && m.items[r.itemIdx].commit.Hash == prevHash {
				m.centerCursor = idx
				m.adjustCenterScroll()
				return
			}
		}
	}
}

// filteredOutgoingFiles returns outgoingPaths filtered by selectedFolder, sorted.
func (m *Model) filteredOutgoingFiles() []string {
	if len(m.outgoingPaths) == 0 {
		return nil
	}
	prefix := m.selectedFolder
	if prefix != "" && !strings.HasSuffix(prefix, "/") {
		prefix += "/"
	}
	out := make([]string, 0, len(m.outgoingPaths))
	for _, f := range m.outgoingPaths {
		if prefix == "" || strings.HasPrefix(f, prefix) {
			out = append(out, f)
		}
	}
	sort.Strings(out)
	return out
}

// adjustCenterScroll keeps centerScroll so that centerCursor stays visible.
func (m *Model) adjustCenterScroll() {
	availableHeight := m.height - 10
	if availableHeight < 4 {
		availableHeight = 4
	}
	if m.centerCursor < m.centerScroll {
		m.centerScroll = m.centerCursor
		return
	}
	if m.centerCursor >= m.centerScroll+availableHeight {
		m.centerScroll = m.centerCursor - availableHeight + 1
	}
	if m.centerScroll < 0 {
		m.centerScroll = 0
	}
}

// currentCenterRow returns the row under the cursor (or zero value if invalid).
func (m *Model) currentCenterRow() centerRow {
	if m.centerCursor < 0 || m.centerCursor >= len(m.centerRows) {
		return centerRow{itemIdx: -1}
	}
	return m.centerRows[m.centerCursor]
}

// pickedFiles returns alphabetical list of files picked for apply.
func (m *Model) pickedFiles() []string {
	out := make([]string, 0, len(m.pickedFile))
	for f, v := range m.pickedFile {
		if v {
			out = append(out, f)
		}
	}
	sort.Strings(out)
	return out
}
