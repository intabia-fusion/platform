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

import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { fetchPreviousBlockmaps, INDEX_FILE, releasesFromManifests, selectReleases } from '../previousBlockmaps'

const BASE = 'https://dist.example/_dist'

function manifest (version: string, ...urls: string[]): string {
  return `version: ${version}\nfiles:\n${urls.map((u) => `  - url: ${u}\n`).join('')}path: ${urls[0]}\n`
}

function release (version: string): { version: string, files: string[] } {
  return { version, files: [`Platform-windows-${version}-x64.exe.blockmap`] }
}

it('collects blockmap names per version from manifests', () => {
  const releases = releasesFromManifests([
    manifest('0.8.54', 'Platform-windows-0.8.54-x64.exe'),
    manifest('0.8.54', 'Platform-macos-0.8.54-arm64.zip', 'Platform-macos-0.8.54-arm64.dmg'),
    'not: a manifest'
  ])
  expect(releases).toEqual([
    {
      version: '0.8.54',
      files: [
        'Platform-windows-0.8.54-x64.exe.blockmap',
        'Platform-macos-0.8.54-arm64.zip.blockmap',
        'Platform-macos-0.8.54-arm64.dmg.blockmap'
      ]
    }
  ])
})

it('keeps the newest releases up to the limit and skips the version being built', () => {
  const previous = ['0.8.53', '0.8.52', '0.8.51', '0.8.50', '0.8.49', '0.8.48'].map(release)
  const selected = selectReleases([release('0.8.54')], previous, '0.8.55', 5)
  expect(selected.map((r) => r.version)).toEqual(['0.8.54', '0.8.53', '0.8.52', '0.8.51', '0.8.50'])

  // A rebuild of the published version brings its own blockmaps.
  const rebuild = selectReleases([release('0.8.54')], [release('0.8.53'), release('0.8.54')], '0.8.54', 5)
  expect(rebuild.map((r) => r.version)).toEqual(['0.8.53'])
})

describe('fetchPreviousBlockmaps', () => {
  let dir: string

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'blockmaps-'))
    fs.writeFileSync(path.join(dir, 'latest.yml'), manifest('0.8.55', 'Platform-windows-0.8.55-x64.exe'))
  })

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true })
    jest.restoreAllMocks()
  })

  it('downloads published and indexed blockmaps and writes the new index', async () => {
    const remote: Record<string, string> = {
      'latest.yml': manifest('0.8.54', 'Platform-windows-0.8.54-x64.exe'),
      [INDEX_FILE]: JSON.stringify([release('0.8.53'), release('0.8.52')]),
      'Platform-windows-0.8.54-x64.exe.blockmap': 'bm-54',
      'Platform-windows-0.8.53-x64.exe.blockmap': 'bm-53'
    }
    jest.spyOn(global, 'fetch').mockImplementation(async (input) => {
      const body = remote[decodeURIComponent(String(input).slice(BASE.length + 1))]
      return new Response(body ?? 'missing', { status: body === undefined ? 404 : 200 })
    })

    const releases = await fetchPreviousBlockmaps(dir, `${BASE}/`, 5)

    expect(fs.readFileSync(path.join(dir, 'Platform-windows-0.8.54-x64.exe.blockmap'), 'utf8')).toBe('bm-54')
    expect(fs.readFileSync(path.join(dir, 'Platform-windows-0.8.53-x64.exe.blockmap'), 'utf8')).toBe('bm-53')
    // 0.8.52 is gone from the dist, so it drops out of the index.
    expect(releases).toEqual([release('0.8.54'), release('0.8.53')])
    expect(JSON.parse(fs.readFileSync(path.join(dir, INDEX_FILE), 'utf8'))).toEqual(releases)
  })
})
