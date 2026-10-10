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

import { MeasureMetricsContext, type WorkspaceUuid } from '@hcengineering/core'
import { DatalakeClient } from '../client'

describe('DatalakeClient.getPartialObject', () => {
  const ctx = new MeasureMetricsContext('test', {})
  const workspace = 'ws' as WorkspaceUuid

  afterEach(() => {
    jest.restoreAllMocks()
  })

  async function rangeOf (offset: number, length?: number): Promise<string> {
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue(new Response('data'))
    await new DatalakeClient('http://datalake', 'token').getPartialObject(ctx, workspace, 'blob', offset, length)
    return (fetchMock.mock.calls[0][1]?.headers as Record<string, string>).Range
  }

  it('requests an open-ended range without a length', async () => {
    expect(await rangeOf(5)).toBe('bytes=5-')
  })

  it('requests an inclusive range with a length', async () => {
    expect(await rangeOf(5, 10)).toBe('bytes=5-14')
  })
})
