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

import { getEmbeddedLabel } from '@hcengineering/platform'
import ui from '@hcengineering/ui'
import type { MenuItem } from '@hcengineering/ui/kit'

import ExampleIcon from '../select-button/ExampleIcon.svelte'
import ExampleSeenRow from './ExampleSeenRow.svelte'

const t = getEmbeddedLabel
const glyph = (name: string): Pick<MenuItem, 'icon' | 'iconProps'> => ({
  icon: ExampleIcon,
  iconProps: { glyph: name }
})

/** A context menu: actions with icons, groups split by a line. */
export const actions: MenuItem[] = [
  { id: 'open', label: t('Open'), icon: ui.icon.PencilLine },
  { id: 'sidebar', label: t('Open in sidebar'), icon: ui.icon.PanelRightFill },
  { id: 'copy', label: t('Copy link'), icon: ui.icon.Link },
  { id: 'edit', label: t('Rename'), icon: ui.icon.PencilLine, divider: true },
  { id: 'duplicate', label: t('Duplicate'), icon: ui.icon.Copy },
  { id: 'delete', label: t('Delete'), icon: ui.icon.Trash, divider: true }
]

/** A value picker: icons of the values, the current one checked. */
export const priorities: MenuItem[] = [
  { id: 'none', label: t('No priority'), ...glyph('priority') },
  { id: 'urgent', label: t('Urgent'), ...glyph('high') },
  { id: 'high', label: t('High'), ...glyph('high') },
  { id: 'medium', label: t('Medium'), ...glyph('priority') },
  { id: 'low', label: t('Low'), ...glyph('priority') }
]

/** Text only. */
export const languages: MenuItem[] = [
  'English',
  'Русский',
  'Deutsch',
  'Español',
  'Français',
  'Português',
  'Italiano'
].map((name) => ({ id: name, label: t(name) }))

/** Choices that need a word of explanation. */
export const notifications: MenuItem[] = [
  { id: 'all', label: t('All messages'), description: t('Every new message and reply'), icon: ui.icon.Plus },
  { id: 'mentions', label: t('Only mentions'), description: t('When someone mentions you'), icon: ui.icon.Link },
  { id: 'mute', label: t('Mute'), description: t('No notifications'), icon: ui.icon.Trash }
]

/** Groups under headings. */
export const table: MenuItem[] = [
  { id: 'col-left', label: t('Insert column left'), heading: t('Column') },
  { id: 'col-right', label: t('Insert column right') },
  { id: 'row-above', label: t('Insert row above'), heading: t('Row') },
  { id: 'row-below', label: t('Insert row below') },
  { id: 'delete-table', label: t('Delete table'), heading: t('Table') }
]

/** Statuses with a color of the palette. */
export const statuses: MenuItem[] = [
  { id: 'backlog', label: t('Backlog'), color: 9 },
  { id: 'interview', label: t('Interview'), color: 2 },
  { id: 'offer', label: t('Offer'), color: 6 },
  { id: 'hired', label: t('Hired'), color: 13 }
]

/** A class tree: a parent is a choice too, its subclasses open in a submenu. */
export const classes: MenuItem[] = [
  {
    id: 'component',
    label: t('Game Component'),
    ...glyph('component'),
    children: [
      {
        id: 'character',
        label: t('Character'),
        ...glyph('component'),
        children: [
          { id: 'enemy', label: t('Enemy'), ...glyph('component') },
          { id: 'player', label: t('Player'), ...glyph('component') }
        ]
      },
      { id: 'item', label: t('Item'), ...glyph('component') }
    ]
  },
  { id: 'document', label: t('Document'), ...glyph('space') },
  { id: 'profile', label: t('User profile'), ...glyph('backlog') }
]

/** Submenus, a link to another page and a row of custom markup. */
export const mixed: MenuItem[] = [
  {
    id: 'status',
    label: t('Status'),
    icon: ExampleIcon,
    iconProps: { glyph: 'progress' },
    submenuOnly: true,
    children: priorities
  },
  {
    id: 'seen',
    label: t('Seen by'),
    icon: ui.icon.PencilLine,
    component: ExampleSeenRow,
    componentProps: { label: 'Seen by', people: ['AK', 'MS', 'JD'] }
  },
  {
    id: 'settings',
    label: t('Task type settings'),
    icon: ui.icon.Sliders,
    href: '#settings',
    opensPage: true,
    divider: true
  }
]

const firstNames = ['Anna', 'Boris', 'Clara', 'Daniel', 'Eva', 'Felix', 'Greta', 'Hugo', 'Irina', 'Jonas']
const lastNames = ['Petrova', 'Ivanov', 'Smith', 'Kim', 'Novak', 'Braun', 'Larsen', 'Moreau', 'Sato', 'Weber']
const teams = ['Design', 'Engineering', 'Marketing', 'Sales', 'Support']

/** A long picker: 500 people in teams, to check scrolling, search and the keyboard on hundreds of rows. */
export const people: MenuItem[] = Array.from({ length: 500 }, (_, i) => {
  const name = `${firstNames[i % 10]} ${lastNames[Math.floor(i / 10) % 10]} ${Math.floor(i / 100) + 1}`
  return {
    id: `person-${i}`,
    label: t(name),
    description: t(`${name.toLowerCase().replace(/ /g, '.')}@example.com`),
    heading: i % 100 === 0 ? t(teams[i / 100]) : undefined
  }
})
