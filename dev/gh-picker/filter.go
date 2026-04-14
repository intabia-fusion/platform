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

import "strings"

func (m *Model) applyFilters() {
	if m.mode == ModeIncoming {
		if m.showIgnored {
			m.items = filterByHashes(m.items, m.store.Incoming)
		} else {
			m.items = filterMissingCommits(m.items)
			m.items = excludeHashes(m.items, m.store.Incoming)
		}
		return
	}
	if m.showIgnored {
		set := map[string]bool{}
		for h := range m.store.Outgoing {
			set[h] = true
		}
		for h := range m.store.Migrated {
			set[h] = true
		}
		m.items = filterByHashes(m.items, set)
	} else {
		m.items = excludeHashes(m.items, m.store.Outgoing)
		m.items = excludeHashes(m.items, m.store.Migrated)
	}
	m.applyOutgoingFilter()
}

func (m *Model) applyOutgoingFilter() {
	if m.mode != ModeOutgoing || m.selectedFolder == "" || m.outgoingFiles == nil {
		return
	}
	prefix := m.selectedFolder
	if prefix != "" && !strings.HasSuffix(prefix, "/") {
		prefix += "/"
	}
	out := m.items[:0]
	for _, it := range m.items {
		files := m.outgoingFiles[it.commit.Hash]
		for _, f := range files {
			if prefix == "" || strings.HasPrefix(f, prefix) {
				out = append(out, it)
				break
			}
		}
	}
	m.items = out
}

func (m Model) selectedHashes() []string {
	var hs []string
	for _, it := range m.items {
		if it.selected {
			hs = append(hs, it.commit.Hash)
		}
	}
	return hs
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

func filterByHashes(items []commitItem, set map[string]bool) []commitItem {
	var out []commitItem
	for _, it := range items {
		if set[it.commit.Hash] {
			out = append(out, it)
		}
	}
	return out
}

func excludeHashes(items []commitItem, set map[string]bool) []commitItem {
	if len(set) == 0 {
		return items
	}
	out := items[:0]
	for _, it := range items {
		if !set[it.commit.Hash] {
			out = append(out, it)
		}
	}
	return out
}
