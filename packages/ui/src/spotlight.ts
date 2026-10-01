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

import type { IntlString } from '@hcengineering/platform'
import { type SvelteComponent } from 'svelte'
import Spotlight from './components/Spotlight.svelte'

// Polls for a selector to appear (e.g. after navigating to another app), up to timeoutMs.
export async function waitForElement (selector: string, timeoutMs = 5000): Promise<HTMLElement | undefined> {
  const existing = document.querySelector<HTMLElement>(selector)
  if (existing !== null) return existing

  return await new Promise((resolve) => {
    const cleanup = (): void => {
      observer.disconnect()
      clearTimeout(timeout)
    }
    const observer = new MutationObserver(() => {
      const el = document.querySelector<HTMLElement>(selector)
      if (el !== null) {
        cleanup()
        resolve(el)
      }
    })
    observer.observe(document.body, { childList: true, subtree: true })
    const timeout = setTimeout(() => {
      cleanup()
      resolve(undefined)
    }, timeoutMs)
  })
}

// Mounts a spotlight ring + dimmed backdrop around target; self-destroys on close.
export function showSpotlight (target: HTMLElement, hint?: IntlString, hintParams: Record<string, any> = {}): void {
  target.scrollIntoView({ block: 'center', behavior: 'smooth' })
  let instance: SvelteComponent | undefined
  const close = (): void => {
    instance?.$destroy()
    instance = undefined
  }
  instance = new Spotlight({ target: document.body, props: { target, hint, hintParams, onClose: close } })
}
