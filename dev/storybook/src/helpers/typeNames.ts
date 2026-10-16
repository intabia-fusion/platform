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

import type { Preview } from '@storybook/svelte'

type ArgTypesEnhancer = NonNullable<Preview['argTypesEnhancers']>[number]

// Svelte docgen inlines type aliases; platform types are branded, so the brand names them back.
const brands: Record<string, string> = {
  __intl_string: 'IntlString',
  __metadata: 'Asset',
  __resource: 'Resource'
}

const branded = /string & \{ __id: true; \} & \{ (__\w+): [^}]*\}/g
const componentType =
  /new \(options: ComponentConstructorOptions<any>\) => SvelteComponent<any, any, any> & \{ element\?: \{ new \(\): HTMLElement; prototype: HTMLElement; \} \| undefined; \}/g

export function prettifyTypeName (summary: string): string {
  const named = summary
    .replace(branded, (match, brand: string) => brands[brand] ?? match)
    .replace(componentType, 'ComponentType')
  // Aliases that inline to the same structure (AnySvelteComponent, ComponentType) collapse to one name.
  return [...new Set(named.split(' | '))].join(' | ')
}

export const prettifyTypeNames: ArgTypesEnhancer = (context) =>
  Object.fromEntries(
    Object.entries(context.argTypes).map(([name, argType]) => {
      const summary = argType.table?.type?.summary
      if (summary === undefined) return [name, argType]
      return [name, { ...argType, table: { ...argType.table, type: { ...argType.table?.type, summary: prettifyTypeName(summary) } } }]
    })
  )
