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
import { getMetadata, setMetadata, unknownStatus } from '@hcengineering/platform'
import login from '../../../../plugins/login/src/index'
import registerLoginStrings from '../../../../plugins/login-assets/src/lang'
import OtpForm from '../../../../plugins/login-resources/src/components/OtpForm.svelte'

registerLoginStrings()

const meta = {
  id: 'fusio-1620-otp-form',
  title: 'Вход и регистрация/Подтверждение кода',
  component: OtpForm,
  args: {
    email: 'anna@example.com',
    retryOn: Date.now() + 60000,
    emailFirst: true,
    consent: { personalData: true, rules: true }
  }
} satisfies Meta<OtpForm>

export default meta
type Story = StoryObj<typeof meta>

export const Confirm: Story = {
  name: 'Подтверждение кода',
  play: async ({ canvasElement }) => {
    const originalFetch = Reflect.get(window, 'fetch') as typeof fetch
    const previousUrl = getMetadata(login.metadata.AccountsUrl)
    const requests: string[] = []
    setMetadata(login.metadata.AccountsUrl, `${window.location.origin}/test-account`)
    window.fetch = async (input, init) => {
      if ((typeof input === 'string' || input instanceof URL) && input.toString().endsWith('/test-account')) {
        requests.push(typeof init?.body === 'string' ? init.body : '')
        return new Response(JSON.stringify({ error: unknownStatus('Invalid OTP') }), { status: 200 })
      }
      return await originalFetch(input, init)
    }
    try {
      const button = canvasElement.querySelector<HTMLButtonElement>('button[type="submit"]')
      if (button?.disabled !== true) throw new Error('Подтверждение должно быть недоступно до ввода кода.')
      for (let index = 1; index <= 6; index++) {
        const input = canvasElement.querySelector<HTMLInputElement>(`input[name="otp${index}"]`)
        if (input == null) throw new Error('Нужно шесть полей для кода.')
        input.value = String(index)
        input.dispatchEvent(new Event('input', { bubbles: true }))
      }
      await new Promise((resolve) => setTimeout(resolve, 100))
      if (button.disabled || requests.at(0) !== undefined) {
        throw new Error('Ввод кода не должен автоматически отправлять запрос.')
      }
      button.click()
      await new Promise((resolve) => setTimeout(resolve, 100))
      if (requests.length !== 1) throw new Error('Подтверждение должно отправить один запрос.')
      const request = JSON.parse(requests[0])
      if (request.params?.consent?.personalData !== true || request.params?.consent?.rules !== true) {
        throw new Error('Подтверждение должно передать оба согласия.')
      }
    } finally {
      window.fetch = originalFetch
      setMetadata(login.metadata.AccountsUrl, previousUrl)
    }
  }
}
