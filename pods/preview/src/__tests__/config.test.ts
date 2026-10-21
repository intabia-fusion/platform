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

import { type Config } from '../config'

// setTimeout turns a delay above this into 1 ms
const MAX_TIMEOUT = 2147483647

// the config reads the environment once, at import
async function load (env: Record<string, string> = {}): Promise<Config> {
  jest.resetModules()
  Object.assign(process.env, { SECRET: 'secret' }, env)
  return (await import('../config')).default
}

describe('video config', () => {
  afterEach(() => {
    delete process.env.SECRET
    delete process.env.FFMPEG_TIMEOUT
    delete process.env.VIDEO_CONCURRENCY
    delete process.env.LIBREOFFICE_TIMEOUT
    delete process.env.PDF_TIMEOUT
  })

  it('limits ffmpeg and pdftocairo to 60 seconds, LibreOffice to 120 and videos to 2 at once by default', async () => {
    const config = await load()

    expect(config.Video).toEqual({ concurrency: 2, timeout: 60 * 1000 })
    expect(config.LibreOfficeTimeout).toBe(120 * 1000)
    expect(config.PdfTimeout).toBe(60 * 1000)
  })

  it('reads the timeouts in seconds and VIDEO_CONCURRENCY as a count', async () => {
    const config = await load({
      FFMPEG_TIMEOUT: '5',
      VIDEO_CONCURRENCY: '3',
      LIBREOFFICE_TIMEOUT: '7',
      PDF_TIMEOUT: '9'
    })

    expect(config.Video).toEqual({ concurrency: 3, timeout: 5000 })
    expect(config.LibreOfficeTimeout).toBe(7000)
    expect(config.PdfTimeout).toBe(9000)
  })

  it('accepts the longest timeout that setTimeout keeps', async () => {
    const seconds = String(Math.floor(MAX_TIMEOUT / 1000))

    const config = await load({ FFMPEG_TIMEOUT: seconds, LIBREOFFICE_TIMEOUT: seconds, PDF_TIMEOUT: seconds })

    expect(config.Video.timeout).toBe(2147483 * 1000)
    expect(config.LibreOfficeTimeout).toBe(2147483 * 1000)
    expect(config.PdfTimeout).toBe(2147483 * 1000)
  })

  // above 2147483647 ms Node sets the timer to 1 ms, and every run is killed at once
  const tooLong = ['2147484', '99999999999']
  it.each([
    ['FFMPEG_TIMEOUT', ['0', '-1', 'soon', '', ...tooLong]],
    ['LIBREOFFICE_TIMEOUT', ['0', '-1', 'soon', '', ...tooLong]],
    ['PDF_TIMEOUT', ['0', '-1', 'soon', '', ...tooLong]],
    ['VIDEO_CONCURRENCY', ['0', '-1', 'many', '']]
  ])('refuses a bad %s', async (name, values) => {
    for (const value of values) {
      await expect(load({ [name]: value })).rejects.toThrow(`${name} must be a positive number`)
      Reflect.deleteProperty(process.env, name)
    }
  })
})
