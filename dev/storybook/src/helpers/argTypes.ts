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
      return [
        name,
        {
          ...argType,
          table: { ...argType.table, type: { ...argType.table?.type, summary: prettifyTypeName(summary) } }
        }
      ]
    })
  )

// aria-* and data-* are passed through to the native element; listing them buries the component's own props.
const passthrough = /^(aria|data)-/

export const hidePassthroughAttributes: ArgTypesEnhancer = (context) =>
  Object.fromEntries(
    Object.entries(context.argTypes).map(([name, argType]) =>
      passthrough.test(name) ? [name, { ...argType, table: { ...argType.table, disable: true } }] : [name, argType]
    )
  )

// Table groups in display order; a prop missing here stays in Storybook's own "properties" group.
const categories: Record<string, readonly string[]> = {
  appearance: [
    'kind',
    'size',
    'shape',
    'label',
    'labelParams',
    'icon',
    'iconSize',
    'iconProps',
    'inheritColor',
    'inheritFont'
  ],
  state: ['disabled', 'loading', 'pressed', 'hasMenu'],
  menu: ['items', 'selected', 'noSelection', 'autoSelectSingle', 'itemParams'],
  'accessibility & focus': ['tooltip', 'autofocus', 'focusIndex'],
  native: ['type', 'id', 'name', 'value', 'form', 'noPrint', 'stopPropagation', 'element'],
  methods: ['focus']
}
const categoryOf = new Map(
  Object.entries(categories).flatMap(([category, props]) => props.map((prop) => [prop, category]))
)
const order = ['story', ...Object.keys(categories), 'properties', 'events', 'slots']

// Documented in the table but not worth a control: no visible effect in a story, or a value no control can edit.
const withoutControl = new Set([
  'label',
  'labelParams',
  'icon',
  'iconProps',
  'items',
  'selected',
  'itemParams',
  'tooltip',
  'autofocus',
  'focusIndex',
  'type',
  'id',
  'name',
  'value',
  'form',
  'noPrint',
  'stopPropagation',
  'element',
  'focus'
])

type Control = Parameters<ArgTypesEnhancer>[0]['argTypes'][string]['control']

// Variants of a union fit on one line.
function inlineRadio (control: Control): Control {
  return typeof control === 'object' && control !== null && 'type' in control && control.type === 'radio'
    ? { ...control, type: 'inline-radio' }
    : control
}

export const organizeProps: ArgTypesEnhancer = (context) => {
  const organized = Object.entries(context.argTypes).map(([name, argType]) => {
    // Args a story adds itself (no docgen category) are story setups, shown first.
    const category = categoryOf.get(name) ?? argType.table?.category ?? 'story'
    const control = withoutControl.has(name) ? false : inlineRadio(argType.control)
    return [name, { ...argType, control, table: { ...argType.table, category } }] as const
  })
  return Object.fromEntries(
    organized.sort(([, a], [, b]) => order.indexOf(a.table.category) - order.indexOf(b.table.category))
  )
}
