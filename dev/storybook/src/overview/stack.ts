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

import type { ComponentType } from 'svelte'

interface RenderResult {
  Component: ComponentType
  props?: Record<string, any>
}

type Render = (args: Record<string, any>, context: any) => RenderResult

// Metas and stories are typed by their own components: only the fields read here are named.
interface StoryModule {
  default: { title?: string, id?: string, args?: object, render?: unknown }
  [exportName: string]: any
}

/** One story of another file, shown on an overview page under its own heading. */
export interface StackEntry {
  title: string
  /** Why the story is here or what to look at, one line. */
  note?: string
  href: string
  Component: ComponentType
  props: Record<string, any>
}

/** A titled group of entries: inputs, choice controls and so on. */
export interface StackGroup {
  title: string
  entries: StackEntry[]
}

// Same rules as the Storybook story id, so the heading opens the story's own page.
function sanitize (value: string): string {
  return value
    .toLowerCase()
    .replace(/[ ’–—―′¿'`~!@#$%^&*()_|+\-=?;:'",.<>{}[\]\\/]/gi, '-')
    .replace(/-+/g, '-')
    .replace(/^-+/, '')
    .replace(/-+$/, '')
}

function storyName (exportName: string): string {
  return exportName.replace(/([a-z0-9])([A-Z])/g, '$1 $2')
}

/** Renders the `exportName` story of a stories module the way Storybook would, with the meta and story args. */
export function entry (title: string, module: StoryModule, exportName: string, note?: string): StackEntry {
  const meta = module.default
  const story = module[exportName] ?? {}
  const render = (story.render ?? meta.render) as Render | undefined
  if (render === undefined) throw new Error(`Story ${exportName} of ${meta.title ?? title} has no render`)
  const result = render({ ...(meta.args ?? {}), ...(story.args ?? {}) }, {})
  const id = `${sanitize(meta.id ?? meta.title ?? '')}--${sanitize(storyName(exportName))}`
  return { title, note, href: `/?path=/story/${id}`, Component: result.Component, props: result.props ?? {} }
}
