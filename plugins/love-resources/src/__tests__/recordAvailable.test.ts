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

import { readRecordAvailable } from '../recordAvailable'

function response (status: number, contentType: string, body: string): Response {
  return new Response(body, { status, headers: { 'content-type': contentType } })
}

describe('readRecordAvailable', () => {
  it('reads a JSON answer', async () => {
    expect(await readRecordAvailable(response(200, 'application/json', 'true'))).toBe(true)
    expect(await readRecordAvailable(response(200, 'application/json; charset=utf-8', 'false'))).toBe(false)
  })

  it('treats an HTML proxy page as unavailable instead of throwing', async () => {
    expect(await readRecordAvailable(response(200, 'text/html', '<html>502 Bad Gateway</html>'))).toBe(false)
  })

  it('treats an error status as unavailable', async () => {
    expect(await readRecordAvailable(response(503, 'application/json', 'true'))).toBe(false)
  })
})
