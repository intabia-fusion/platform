/** @jest-environment jsdom */
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

import { publicFilePath, setPublicFileCookie } from './publicFiles'

it('keeps cookies for two links of one workspace independent', () => {
  const name = 'presentation-metadata-Token'
  setPublicFileCookie(name, 'token-a', 'workspace', 'a')
  setPublicFileCookie(name, 'token-b', 'workspace', 'b')
  // The URL determines which scoped cookies the browser sends.
  window.history.replaceState({}, '', publicFilePath('workspace', 'a') + 'image.png')
  expect(document.cookie).toBe(`${name}=token-a`)
  window.history.replaceState({}, '', publicFilePath('workspace', 'b') + 'attachment.pdf')
  expect(document.cookie).toBe(`${name}=token-b`)
  window.history.replaceState({}, '', publicFilePath('workspace', 'a') + 'image.png')
  expect(document.cookie).toBe(`${name}=token-a`)
  window.history.replaceState({}, '', publicFilePath('workspace', 'ab') + 'image.png')
  expect(document.cookie).toBe('')
})
