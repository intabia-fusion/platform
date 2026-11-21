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
import EmailFirstForm from '../../../../plugins/login-resources/src/components/EmailFirstForm.svelte'

const meta = {
  id: 'fusio-1620-email-first',
  title: 'Вход и регистрация/Вход по почте',
  component: EmailFirstForm
} satisfies Meta<EmailFirstForm>

export default meta
type Story = StoryObj<typeof meta>

export const RateLimit: Story = {
  name: 'Ожидание после ограничения',
  play: async ({ canvasElement }) => {
    const originalFetch = Reflect.get(window, 'fetch') as typeof fetch
    const previousUrl = getMetadata(login.metadata.AccountsUrl)
    setMetadata(login.metadata.AccountsUrl, `${window.location.origin}/test-account`)
    window.fetch = async (input, init) => {
      if (
        (typeof input === 'string' || input instanceof URL) &&
        input.toString().endsWith('/test-account') &&
        init?.method === 'POST'
      ) {
        const error = unknownStatus('Rate limit', { retryOn: Date.now() + 60000 })
        return new Response(JSON.stringify({ error }), { status: 429 })
      }
      return await originalFetch(input, init)
    }
    try {
      const email = canvasElement.querySelector<HTMLInputElement>('input[name="email"]')
      if (email === null) throw new Error('Нужна почта.')
      email.value = 'anna@example.com'
      email.dispatchEvent(new Event('input', { bubbles: true }))
      for (const input of canvasElement.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')) {
        if (!input.checked) input.click()
      }
      await new Promise((resolve) => setTimeout(resolve, 100))
      email.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }))
      await new Promise((resolve) => setTimeout(resolve, 100))
      const button = canvasElement.querySelector<HTMLButtonElement>('.send button')
      if (button?.disabled !== true) throw new Error('Повторная отправка должна ожидать retryOn.')
    } finally {
      window.fetch = originalFetch
      setMetadata(login.metadata.AccountsUrl, previousUrl)
    }
  }
}
