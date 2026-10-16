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

import type { ThemeVars } from '@storybook/theming'
import { create } from '@storybook/theming/create'

// The manager has no theme CSS, so values are copied from packages/theme/styles (_colors.scss, _accent-colors.scss).
const shared = {
  brandTitle: 'Fusion UI',
  brandTarget: '_self',
  fontBase: '"IBM Plex Sans", system-ui, sans-serif',
  fontCode: 'ui-monospace, "SF Mono", Menlo, monospace',
  appBorderRadius: 8,
  inputBorderRadius: 6
} satisfies Partial<ThemeVars>

export const lightTheme: ThemeVars = create({
  ...shared,
  base: 'light',
  colorPrimary: '#6b3ad3',
  colorSecondary: '#6b3ad3',
  appBg: '#FBFBFC',
  appContentBg: '#FFFFFF',
  appPreviewBg: '#F1F1F4',
  appBorderColor: 'rgba(0, 0, 0, .1)',
  textColor: 'rgba(0, 0, 0, .8)',
  textMutedColor: 'rgba(0, 0, 0, .6)',
  barBg: '#FFFFFF',
  barTextColor: 'rgba(0, 0, 0, .6)',
  barSelectedColor: '#6b3ad3',
  barHoverColor: '#562ea9'
})

export const darkTheme: ThemeVars = create({
  ...shared,
  base: 'dark',
  colorPrimary: '#6b3ad3',
  colorSecondary: '#6b3ad3',
  appBg: '#14141F',
  appContentBg: '#1A1A28',
  appPreviewBg: '#1A1A28',
  appBorderColor: 'rgba(255, 255, 255, .1)',
  textColor: 'rgba(255, 255, 255, .8)',
  textMutedColor: 'rgba(255, 255, 255, .6)',
  barBg: '#1A1A28',
  barTextColor: 'rgba(255, 255, 255, .6)',
  barSelectedColor: '#FFFFFF',
  barHoverColor: '#FFFFFF'
})

export const systemTheme = (): ThemeVars =>
  window.matchMedia('(prefers-color-scheme: dark)').matches ? darkTheme : lightTheme
