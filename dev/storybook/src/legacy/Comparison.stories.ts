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
import { ButtonIcon, ButtonMenu, IconAdd, IconOptions, IconSettings, ModernButton } from '@hcengineering/ui'
import { Button, IconButton, MenuButton } from '@hcengineering/ui/kit'
import type { Meta, StoryObj } from '@storybook/svelte'

import Matrix from '../helpers/Matrix.svelte'
import { axis, type MatrixAxis } from '../helpers/matrix'

// Goes away together with ModernButton, ButtonIcon and ButtonMenu once their usages move to the kit.

interface ComparisonArgs {
  legacy: 'ModernButton' | 'ButtonIcon' | 'ButtonMenu'
  columns: 'sizes' | 'states'
}

const kinds = ['primary', 'secondary', 'tertiary', 'negative'] as const
const states: MatrixAxis = [
  { title: 'default', props: {} },
  { title: 'pressed', props: { pressed: true } },
  { title: 'loading', props: { loading: true } },
  { title: 'disabled', props: { disabled: true } }
]

const menuItems = [
  { id: 'list', label: getEmbeddedLabel('List') },
  { id: 'board', label: getEmbeddedLabel('Board') }
]

const legacy = {
  ModernButton: {
    component: ModernButton,
    kit: Button,
    sizes: ['large', 'medium', 'small', 'extra-small'],
    props: { label: getEmbeddedLabel('Button'), icon: IconAdd }
  },
  ButtonIcon: {
    component: ButtonIcon,
    kit: IconButton,
    sizes: ['large', 'medium', 'small', 'extra-small', 'min'],
    props: { icon: IconSettings, tooltip: { label: getEmbeddedLabel('Settings') } }
  },
  ButtonMenu: {
    component: ButtonMenu,
    kit: MenuButton,
    sizes: ['large', 'medium', 'small', 'extra-small'],
    props: { label: getEmbeddedLabel('View'), icon: IconOptions, items: menuItems }
  }
} as const

const meta: Meta<ComparisonArgs> = {
  title: 'Legacy (to be removed)/Comparison',
  args: { legacy: 'ModernButton', columns: 'sizes' },
  argTypes: {
    legacy: { control: 'inline-radio', options: ['ModernButton', 'ButtonIcon', 'ButtonMenu'] },
    columns: { control: 'inline-radio', options: ['sizes', 'states'] }
  },
  parameters: { layout: 'padded' },
  tags: ['!autodocs']
}

export default meta

/** Each legacy cell is followed by its kit counterpart with the same props: every pair must look the same. */
export const Comparison: StoryObj<ComparisonArgs> = {
  render: (args) => {
    const reference = legacy[args.legacy]
    const lines = args.columns === 'sizes' ? axis('size', reference.sizes) : states
    return {
      Component: Matrix,
      props: {
        component: reference.kit,
        rows: axis('kind', kinds),
        columns: lines.flatMap((line) => [
          { ...line, title: `${line.title} · legacy`, component: reference.component },
          { ...line, title: `${line.title} · kit` }
        ]),
        props: reference.props
      }
    }
  }
}
