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

import collected, { type PlatformIcon } from 'virtual:platform-icons'

// Components whose shape comes from props: their markup drawn for 2 of 3 steps, as the drafts are.
const SAMPLES: Record<string, string> = {
  'plugins/task-resources/src/components/icons/IconStarted.svelte#IconStarted':
    '<svg fill="currentColor" viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg"><g transform="rotate(-90 16 16)"><path fill-rule="evenodd" d="M16 2a14 14 0 1 1 0 28a14 14 0 0 1 0-28zm0 2a12 12 0 1 0 0 24a12 12 0 0 0 0-24z"/><path d="M 9 9 L 18 9 A 9 9 0 1 1 0 9.09 Z" transform="translate(7,7)"/></g></svg>',
  'plugins/task-resources/src/components/icons/IconStartedRing.svelte#IconStartedRing':
    '<svg viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg"><g transform="rotate(-90 16 16)"><path d="M 28.925 17.397 A 13 13 0 0 1 10.748 27.892" fill="none" stroke="currentColor" stroke-width="4" opacity="1"/><path d="M 8.328 26.494 A 13 13 0 0 1 8.328 5.506" fill="none" stroke="currentColor" stroke-width="4" opacity="1"/><path d="M 10.748 4.108 A 13 13 0 0 1 28.925 14.603" fill="none" stroke="currentColor" stroke-width="4" opacity="0.3"/></g></svg>'
}

const icons = collected.map((icon) => {
  const sample = SAMPLES[`${icon.file}#${icon.name}`]
  return sample === undefined ? icon : { ...icon, svg: sample }
})

export { icons }
export type { PlatformIcon }
