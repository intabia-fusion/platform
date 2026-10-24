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

/** Heights of the kit buttons of the same name: `small` (2rem) in the apps panel, `extra-small` in its compact mode. */
export type WorkspaceLogoSize = 'small' | 'extra-small'

/** The workspace picture, or its first letter on the brand fill; not clickable by itself. */
export interface WorkspaceLogoProps {
  /** Workspace name: the accessible name and the letter when there is no picture. */
  name: string
  src?: string
  srcset?: string
  size?: WorkspaceLogoSize
  /** A dot in the corner: something new in another workspace; announced as part of the name. */
  notify?: boolean
}
