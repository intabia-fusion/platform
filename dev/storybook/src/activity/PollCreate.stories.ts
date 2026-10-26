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

import type { Meta, StoryObj } from '@storybook/svelte'

import CreatePollCase from './CreatePollCase.svelte'
import { setupActivity } from './setup'

const meta: Meta = {
  title: 'Activity/Poll Create',
  tags: ['!autodocs'],
  loaders: [setupActivity]
}

export default meta

/** The form from the message input: Create stays disabled, its tooltip tells why. */
export const PollCreate: StoryObj = {
  name: 'Poll Create',
  parameters: { layout: 'fullscreen', controls: { disable: true } },
  render: () => ({ Component: CreatePollCase })
}
