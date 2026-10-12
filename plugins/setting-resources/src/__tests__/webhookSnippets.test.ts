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

import { renderWebhookSnippet } from '../webhookSnippets'

const url = 'http://localhost:8083/_webhook/api/v1/webhook/action'
const body = { action: 'chat:post', channel: 'general', message: "It's done\n`ok`", urgent: true, extra: null }

describe('renderWebhookSnippet', () => {
  it('escapes single quotes for the shell in curl', () => {
    const text = renderWebhookSnippet('curl', url, '<API_KEY>', body)
    expect(text).toContain("It'\\''s done")
    expect(text).toContain('Authorization: Bearer <API_KEY>')
  })

  it('writes Python literals for booleans and null', () => {
    const text = renderWebhookSnippet('python', url, '<API_KEY>', body)
    expect(text).toContain('"urgent": True')
    expect(text).toContain('"extra": None')
    expect(text).toContain('"message": "It\'s done\\n`ok`"')
  })

  it('keeps backticks out of the Go raw string', () => {
    const text = renderWebhookSnippet('go', url, '<API_KEY>', body)
    expect(text).toContain('` + "`" + `ok` + "`" + `')
  })

  it('round-trips the JSON body unchanged', () => {
    expect(JSON.parse(renderWebhookSnippet('json', url, '<API_KEY>', body))).toEqual(body)
  })
})
