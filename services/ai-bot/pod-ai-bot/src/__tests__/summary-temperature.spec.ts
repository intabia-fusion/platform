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

/**
 * Summaries extract facts, so the sampling spread is noise: the same transcript produced three
 * different texts across runs while the provider default was in effect. The value is configurable
 * so it can be tuned without rebuilding the image.
 */
describe('SummaryTemperature', () => {
  const base = {
    ACCOUNTS_URL: 'http://account:3000',
    SERVER_SECRET: 'secret',
    FIRST_NAME: 'Julia',
    LAST_NAME: 'AI',
    STORAGE_CONFIG: 'minio',
    CHUNK_STORAGE_CONFIG: 'minio'
  }

  function loadConfig (value?: string): number {
    jest.resetModules()
    const saved = { ...process.env }
    Object.assign(process.env, base)
    if (value === undefined) {
      delete process.env.SUMMARY_TEMPERATURE
    } else {
      process.env.SUMMARY_TEMPERATURE = value
    }
    try {
      /* eslint-disable @typescript-eslint/no-var-requires */
      return (require('../config').default as { SummaryTemperature: number }).SummaryTemperature
      /* eslint-enable @typescript-eslint/no-var-requires */
    } finally {
      process.env = saved
    }
  }

  it('defaults low rather than to the provider default', () => {
    expect(loadConfig()).toBe(0.1)
  })

  it('takes the value from the environment', () => {
    expect(loadConfig('0')).toBe(0)
    expect(loadConfig('0.7')).toBe(0.7)
  })
})
