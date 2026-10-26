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

/// <reference types="vite/client" />

declare module 'virtual:platform-icons' {
  /** An svg found in the platform sources (`scripts/platform-icons.mjs`). */
  export interface PlatformIcon {
    id: string
    name: string
    /** Plugin or package: `plugins/tracker`, `packages/ui`. */
    source: string
    file: string
    line: number
    kind: 'sprite' | 'svg' | 'svelte' | 'ts' | 'css'
    /** Static markup with a viewBox and no size. */
    svg: string
    /** Has its own <style>: drawn as an image so the rules stay inside it. */
    isolated: boolean
  }
  const icons: PlatformIcon[]
  export default icons
}
