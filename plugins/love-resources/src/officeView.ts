//
// Copyright © 2026 Intabia Fusion.
//
// Licensed under the Eclipse Public License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License. You may
// obtain a copy of the License at https://www.eclipse.org/legal/epl-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
//
// See the License for the specific language governing permissions and
// limitations under the License.
//

// Which part of the office the URL points at: /love/<segment>. Kept apart from the stores so the rule
// stays testable without the plugin graph those stores pull in.
export type OfficeView = 'meetings' | 'groups' | 'floors' | 'floor'

// 'permanent' is the old name of the groups tab: links and bookmarks made before the rename still open it.
export function officeViewOf (segment: string | undefined): OfficeView {
  if (segment === 'meetings' || segment === 'groups') return segment
  if (segment === 'permanent') return 'groups'
  return segment === undefined ? 'floors' : 'floor'
}
