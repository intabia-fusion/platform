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

import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { get } from 'svelte/store'
import { readFileSync } from 'node:fs'
import * as platform from '@hcengineering/platform'
import { addStringsLoader } from '@hcengineering/platform'
import { languageStore, themeStore } from '@hcengineering/theme'
import {
  desktopDownloadsId,
  setDownloadItemActions,
  type DownloadActionStatus,
  type DownloadItem
} from '@hcengineering/desktop-downloads'
import { downloads, removeDownloadItem, updateDownloadItem } from '../store'
import Popup from '../components/FileDownloadStatusPopup.svelte'

const en = JSON.parse(readFileSync('../desktop-downloads-assets/lang/en.json', 'utf8'))
const ru = JSON.parse(readFileSync('../desktop-downloads-assets/lang/ru.json', 'utf8'))

const settle = async (): Promise<void> => {
  await new Promise((resolve) => setTimeout(resolve, 20))
}

let component: Popup
let close: ReturnType<typeof vi.fn>
let open: ReturnType<typeof vi.fn>
let reveal: ReturnType<typeof vi.fn>
let previousLanguage: string

function row (index = 0): HTMLElement {
  return document.querySelectorAll<HTMLElement>('.upload-file-row')[index]
}

function button (index = 0, action = 1): HTMLButtonElement {
  return row(index).querySelectorAll('button')[action]
}

beforeAll(() => {
  addStringsLoader(desktopDownloadsId, async (language) => (language === 'ru' ? ru : en))
})

beforeEach(async () => {
  previousLanguage = get(languageStore)
  themeStore.update((theme) => ({ ...theme, language: 'en' }))
  document.body.innerHTML = ''
  for (const key of ['first', 'second']) {
    const item: DownloadItem = {
      key,
      state: 'completed',
      fileName: key + '.txt',
      receivedBytes: 10,
      totalBytes: 10,
      url: 'https://example.com/' + key,
      savePath: '/tmp/' + key + '.txt'
    }
    updateDownloadItem(item)
  }
  open = vi.fn(async (): Promise<DownloadActionStatus> => 'cancelled')
  reveal = vi.fn(async (): Promise<DownloadActionStatus> => 'cancelled')
  setDownloadItemActions({ open, reveal })
  close = vi.fn()
  component = new Popup({ target: document.body })
  component.$on('close', close)
  await settle()
})

afterEach(() => {
  component.$destroy()
  vi.restoreAllMocks()
  for (const item of get(downloads)) removeDownloadItem(item)
  setDownloadItemActions(undefined)
  themeStore.update((theme) => ({ ...theme, language: previousLanguage }))
})

describe('download popup actions', () => {
  it('uses registered host actions and translated button tooltips', async () => {
    expect(button(0, 0).getAttribute('aria-label')).toBe(en.string.ShowInFolder)
    expect(button().getAttribute('aria-label')).toBe(en.string.OpenFile)
    button().click()
    await settle()
    expect(open).toHaveBeenCalledWith('first', {
      title: en.string.OpenFile,
      message: en.string.OpenExecutable,
      open: en.string.Open,
      cancel: expect.any(String)
    })
    button(1, 0).click()
    await settle()
    expect(reveal).toHaveBeenCalledWith('second')
  })

  it.each([
    ['en', 0],
    ['en', 1],
    ['ru', 0],
    ['ru', 1]
  ] as const)('shows failed errors only in their row in %s for action %s', async (language, action) => {
    themeStore.update((theme) => ({ ...theme, language }))
    open.mockResolvedValue('failed')
    reveal.mockResolvedValue('failed')
    button(0, action).click()
    await settle()
    expect(row().querySelector('[role="alert"]')?.textContent?.trim()).toBe(
      language === 'ru' ? 'Не удалось открыть файл или папку.' : 'Could not open the file or folder.'
    )
    expect(row().querySelectorAll('button')).toHaveLength(1)
    expect(row(1).querySelector('[role="alert"]')).toBeNull()
    expect(row(1).querySelectorAll('button')).toHaveLength(2)
    expect(close).not.toHaveBeenCalled()
  })

  it.each(['missing', 'unknown'])('hides both actions for %s', async (status) => {
    reveal.mockResolvedValue(status)
    button(0, 0).click()
    await settle()
    expect(row().querySelectorAll('button')).toHaveLength(0)
    expect(row().querySelector('[role="alert"]')?.textContent?.trim()).toBe(en.string.FileMissing)
    expect(row(1).querySelectorAll('button')).toHaveLength(2)
    expect(close).not.toHaveBeenCalled()
  })

  it('keeps a cancelled action silent and leaves the popup open', async () => {
    button().click()
    await settle()
    expect(document.querySelector('[role="alert"]')).toBeNull()
    expect(row().querySelectorAll('button')).toHaveLength(2)
    expect(close).not.toHaveBeenCalled()
  })

  it.each([0, 1])('closes after successful action %s', async (action) => {
    open.mockResolvedValue('ok')
    reveal.mockResolvedValue('ok')
    button(0, action).click()
    await settle()
    expect(close).toHaveBeenCalledOnce()
  })

  it.each([0, 1])('reports rejected IPC action %s and unlocks the controls', async (action) => {
    open.mockRejectedValue(new Error('IPC disconnected'))
    reveal.mockRejectedValue(new Error('IPC disconnected'))
    button(0, action).click()
    await settle()
    expect(row().querySelector('[role="alert"]')?.textContent?.trim()).toBe(en.string.OpenFailed)
    expect(button(0, 0).disabled).toBe(false)
    expect(close).not.toHaveBeenCalled()
  })

  it('blocks other actions while translating the native confirmation', async () => {
    let finishTranslation: (value: string) => void = () => {}
    const translation = new Promise<string>((resolve) => {
      finishTranslation = resolve
    })
    vi.spyOn(platform, 'translate').mockImplementation(async () => await translation)
    button().click()
    await settle()
    const disabled = Array.from(document.querySelectorAll('button')).every((item) => item.disabled)
    button(1, 0).click()
    finishTranslation('Translated confirmation')
    await settle()
    expect(disabled).toBe(true)
    expect(reveal).not.toHaveBeenCalled()
    expect(open).toHaveBeenCalledOnce()
    expect(button().disabled).toBe(false)
  })

  it('blocks all actions until the pending host operation settles', async () => {
    let finish: (status: DownloadActionStatus) => void = () => {}
    reveal.mockImplementation(
      async () =>
        await new Promise<DownloadActionStatus>((resolve) => {
          finish = resolve
        })
    )
    button(0, 0).click()
    await settle()
    expect(Array.from(document.querySelectorAll('button')).every((item) => item.disabled)).toBe(true)
    button(1, 0).click()
    expect(reveal).toHaveBeenCalledTimes(1)
    finish('cancelled')
    await settle()
    expect(Array.from(document.querySelectorAll('button')).every((item) => !item.disabled)).toBe(true)
  })
})
