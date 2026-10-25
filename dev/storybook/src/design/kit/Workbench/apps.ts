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

import type { AppEntry } from '../types'

// Application rail of the sanity stand in order; `app` ties an entry to the open application
export const railApps: Array<AppEntry & { app?: string }> = [
  { icon: 'kit/Bell', notify: true },
  { icon: 'kit/Bubble', notify: true, app: 'chunter' },
  { icon: 'kit/Calendar' },
  { icon: 'kit/Building', divider: true },
  { icon: 'kit/PanelRight' },
  { icon: 'kit/PersonCircle' },
  { icon: 'kit/PersonSearch' },
  { icon: 'kit/Funnel' },
  { icon: 'kit/Archive' },
  { icon: 'kit/PersonRefresh' },
  { icon: 'kit/CheckSquare', app: 'tracker' },
  { icon: 'kit/Document' },
  { icon: 'kit/Lightning' },
  { icon: 'kit/CloudTree' },
  { icon: 'kit/Clipboard' },
  { icon: 'kit/GraduationCap' },
  { icon: 'kit/Cube' },
  { icon: 'kit/Hierarchy' },
  { icon: 'kit/PencilLine' }
]

export const sidebarWidgets: string[] = ['kit/Calendar', 'kit/Building', 'kit/Star', 'kit/Sparkle']
