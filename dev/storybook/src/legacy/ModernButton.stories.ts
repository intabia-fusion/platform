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
import { IconAdd, ModernButton } from '@hcengineering/ui'
import type { Meta, StoryObj } from '@storybook/svelte'
import Matrix from '../helpers/Matrix.svelte'
import { axis } from '../helpers/matrix'

const kinds = ['primary', 'secondary', 'tertiary', 'negative'] as const
const sizes = ['large', 'medium', 'small', 'extra-small', 'min'] as const

// Reference rendering for the ui-kit Button; goes away together with ModernButton.
const meta = {
  title: 'Legacy/ModernButton',
  component: ModernButton,
  args: { label: getEmbeddedLabel('Button'), kind: 'secondary', size: 'large' },
  argTypes: {
    label: { control: false },
    kind: { control: 'inline-radio', options: kinds },
    size: { control: 'inline-radio', options: sizes },
    shape: { control: 'inline-radio', options: ['rectangle', 'round'] }
  }
} satisfies Meta<ModernButton>

export default meta
type Story = StoryObj<typeof meta>

export const Playground: Story = {}

export const WithIcon: Story = { args: { icon: IconAdd } }

export const Variants: Story = {
  parameters: { layout: 'padded' },
  render: () => ({
    Component: Matrix,
    props: {
      component: ModernButton,
      rows: axis('kind', kinds),
      columns: axis('size', sizes),
      props: { label: getEmbeddedLabel('Button'), icon: IconAdd }
    }
  })
}

export const States: Story = {
  parameters: { layout: 'padded' },
  render: () => ({
    Component: Matrix,
    props: {
      component: ModernButton,
      rows: axis('kind', kinds),
      columns: [
        { title: 'default', props: {} },
        { title: 'pressed', props: { pressed: true } },
        { title: 'loading', props: { loading: true } },
        { title: 'disabled', props: { disabled: true } }
      ],
      props: { label: getEmbeddedLabel('Button') }
    }
  })
}
