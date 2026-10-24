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

// Screen files of dev/design/design.json that have a Storybook section: the section title and the build entries.
// Paths are relative to dev/design; every entry runs as one script, as `penpot.mjs build` does.
// `canvas: true` adds one canvas of all pages: it renders every frame at once and hangs on large files.
export interface ScreenFile {
  title: string
  build: string[][]
  canvas: boolean
}

export function screenFiles (designText: string): ScreenFile[] {
  const design = JSON.parse(designText) as {
    files: Array<{ storybook?: string, build?: string[][], canvas?: boolean }>
  }
  return design.files.flatMap((f) =>
    f.storybook !== undefined ? [{ title: f.storybook, build: f.build ?? [], canvas: f.canvas === true }] : []
  )
}
