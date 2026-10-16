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

import type { StorybookConfig } from '@storybook/svelte-vite'

const config: StorybookConfig = {
  framework: { name: '@storybook/svelte-vite', options: {} },
  stories: ['../src/**/*.mdx', '../src/**/*.stories.ts'],
  addons: ['@storybook/addon-essentials', '@storybook/addon-a11y'],
  staticDirs: [{ from: '../../../packages/theme/fonts/complete/woff2', to: '/fonts' }],
  core: { disableTelemetry: true, disableWhatsNewNotifications: true }
}

export default config
