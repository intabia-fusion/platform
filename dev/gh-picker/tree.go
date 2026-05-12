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
	"sort"
	"strings"
)

// treeNode is folder node for outgoing file tree
type treeNode struct {
	name         string
	path         string // full path relative to repo root; "" = root
	depth        int
	expanded     bool
	children     map[string]*treeNode
	files        map[string]bool
	commitHashes map[string]bool
}

func (m *Model) rebuildTree() {
	prev := m.treeExpanded
	if prev == nil {
		prev = map[string]bool{}
	}
	root := &treeNode{
		name:         "/",
		path:         "",
		depth:        0,
		expanded:     true,
		children:     map[string]*treeNode{},
		files:        map[string]bool{},
		commitHashes: map[string]bool{},
	}
	for _, f := range m.outgoingPaths {
		parts := strings.Split(f, "/")
		cur := root
		cur.commitHashes[f] = true
		for i := 0; i < len(parts)-1; i++ {
			name := parts[i]
			child, ok := cur.children[name]
			if !ok {
				fullPath := strings.Join(parts[:i+1], "/")
				depth := i + 1
				exp := false
				if v, ok := prev[fullPath]; ok {
					exp = v
				}
				child = &treeNode{
					name:         name,
					path:         fullPath,
					depth:        depth,
					expanded:     exp,
					children:     map[string]*treeNode{},
					files:        map[string]bool{},
					commitHashes: map[string]bool{},
				}
				cur.children[name] = child
			}
			cur = child
			cur.commitHashes[f] = true
		}
		cur.files[parts[len(parts)-1]] = true
	}
	m.tree = root
	m.rebuildTreeFlat()
}

func (m *Model) rebuildTreeFlat() {
	m.treeFlat = flattenTree(m.tree, nil)
	if m.treeCursor >= len(m.treeFlat) {
		m.treeCursor = 0
	}
}

func flattenTree(n *treeNode, out []*treeNode) []*treeNode {
	if n == nil {
		return out
	}
	out = append(out, n)
	if !n.expanded {
		return out
	}
	names := make([]string, 0, len(n.children))
	for k := range n.children {
		names = append(names, k)
	}
	sort.Strings(names)
	for _, name := range names {
		out = flattenTree(n.children[name], out)
	}
	return out
}
