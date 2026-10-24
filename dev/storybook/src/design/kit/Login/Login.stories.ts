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

import FramedSections from '../FramedSections.svelte'
import LoginDemo from '../demo/LoginDemo.svelte'
import LoginPageDemo from '../demo/LoginPageDemo.svelte'
import LoginAction from './LoginAction.svelte'
import LoginBackTitle from './LoginBackTitle.svelte'
import LoginButton from './LoginButton.svelte'
import LoginCheckbox from './LoginCheckbox.svelte'
import LoginCode from './LoginCode.svelte'
import LoginField from './LoginField.svelte'
import LoginLinks from './LoginLinks.svelte'
import LoginOtpHeader from './LoginOtpHeader.svelte'
import LoginProviders from './LoginProviders.svelte'
import LoginStatus from './LoginStatus.svelte'
import LoginTabs from './LoginTabs.svelte'
import LoginTitle from './LoginTitle.svelte'
import LoginWorkspace from './LoginWorkspace.svelte'

const meta: Meta = {
  title: 'Kit (pen.dev)/Login',
  tags: ['!autodocs'],
  parameters: { layout: 'padded', controls: { disable: true } }
}

export default meta
type Story = StoryObj<typeof meta>

const sections = (list: unknown[]): Story => ({
  render: (_args, { title, name }) => ({
    Component: FramedSections,
    props: { sections: list, title: `${title.slice(title.lastIndexOf('/') + 1)} - ${name}` }
  })
})

const one = [{ title: '', props: {} }]
const sized = (
  component: unknown,
  width: number,
  height: number,
  props: Record<string, unknown>
): Record<string, unknown> => ({ component, width, height, props })
const demo = (title: string, rows: unknown[]): Record<string, unknown> => ({
  title,
  component: LoginDemo,
  rows,
  columns: one
})

export const Page: Story = {
  parameters: { layout: 'fullscreen', controls: { disable: true } },
  render: () => ({ Component: LoginPageDemo })
}

export const FormStates: Story = sections([
  demo('LoginTabs and LoginTitle', [
    {
      title: 'tabs',
      props: sized(LoginTabs, 460, 100, {
        heading: 'Intabia Platform',
        tabs: ['Sign up', 'Log In'],
        selected: 'Log In'
      })
    },
    { title: 'tab only', props: sized(LoginTabs, 460, 60, { tabs: ['Log In'], selected: 'Log In', width: 300 }) },
    { title: 'title', props: sized(LoginTitle, 460, 80, { text: 'Password recovery', subtitle: 'Anna Smith' }) }
  ]),
  demo('LoginField', [
    { title: 'empty', props: sized(LoginField, 460, 80, { label: 'Email' }) },
    { title: 'value', props: sized(LoginField, 460, 80, { label: 'Email', value: 'demo1' }) },
    { title: 'password', props: sized(LoginField, 460, 80, { label: 'Password', value: '12345678', password: true }) },
    {
      title: 'error',
      props: sized(LoginField, 460, 80, { label: 'Password', value: '12345678', password: true, error: true })
    }
  ]),
  demo('LoginStatus', [
    { title: 'info', props: sized(LoginStatus, 460, 80, { text: 'Required field Email' }) },
    { title: 'error', props: sized(LoginStatus, 460, 80, { text: 'Incorrect password', kind: 'error' }) },
    { title: 'empty', props: sized(LoginStatus, 460, 40, {}) }
  ]),
  demo('LoginCheckbox', [
    { title: 'unchecked', props: sized(LoginCheckbox, 460, 40, { checked: false, label: 'Set password now' }) },
    { title: 'checked', props: sized(LoginCheckbox, 460, 40, { checked: true, label: 'Set password now' }) },
    {
      title: 'invalid',
      props: sized(LoginCheckbox, 460, 40, { checked: false, invalid: true, label: 'Set password now' })
    }
  ])
])

export const ButtonStates: Story = sections([
  demo('LoginButton', [
    { title: 'primary', props: sized(LoginButton, 460, 80, { label: 'Log In', width: 396 }) },
    { title: 'disabled', props: sized(LoginButton, 460, 80, { label: 'Log In', disabled: true, width: 396 }) },
    {
      title: 'default',
      props: sized(LoginButton, 460, 80, { label: 'Create new account', kind: 'default', width: 396 })
    },
    {
      title: 'provider',
      props: sized(LoginButton, 460, 80, {
        label: 'Continue with Google',
        kind: 'provider',
        icon: 'google',
        width: 396
      })
    }
  ]),
  demo('LoginProviders', [
    {
      title: 'two',
      props: sized(LoginProviders, 460, 120, {
        items: [
          ['google', 'Google'],
          ['github', 'GitHub']
        ]
      })
    },
    {
      title: 'three',
      props: sized(LoginProviders, 460, 250, {
        items: [
          ['google', 'Google'],
          ['github', 'GitHub'],
          ['openid', 'OpenID']
        ]
      })
    }
  ]),
  demo('LoginLinks and LoginAction', [
    { title: 'links', props: sized(LoginLinks, 460, 60, { rows: [['Forgot your password?', 'Recover']] }) },
    {
      title: 'accent',
      props: sized(LoginLinks, 460, 60, {
        rows: [['Not seeing your workspace?', 'Change account']],
        accent: true,
        width: 428
      })
    },
    { title: 'action', props: sized(LoginAction, 460, 40, { text: 'Login with code' }) }
  ])
])

export const CodeAndListStates: Story = sections([
  demo('LoginOtpHeader and LoginCode', [
    {
      title: 'header',
      props: sized(LoginOtpHeader, 460, 100, { title: 'Enter the code', sent: 'We sent the code to', email: 'demo1' })
    },
    { title: 'filled', props: sized(LoginCode, 460, 100, { digits: '482913' }) },
    { title: 'empty', props: sized(LoginCode, 460, 100, {}) }
  ]),
  demo('LoginWorkspace and LoginBackTitle', [
    { title: 'back title', props: sized(LoginBackTitle, 460, 80, { title: 'Select workspace' }) },
    { title: 'workspace', props: sized(LoginWorkspace, 460, 100, { name: 'demo-ws', note: '(2 days)' }) }
  ])
])
