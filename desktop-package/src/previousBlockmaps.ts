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
import * as path from 'path'
import * as yaml from 'js-yaml'

// A differential update needs the blockmap of the installed version too, but the dist image
// holds only one build; this carries blockmaps of the last releases from the live dist over.

export const INDEX_FILE = 'previous-blockmaps.json'
const MANIFESTS = ['latest.yml', 'latest-mac.yml', 'latest-linux.yml']

export interface BlockmapRelease {
  version: string
  files: string[]
}

/** Blockmap names per version referenced by update manifests, in manifest order. */
export function releasesFromManifests (manifests: string[]): BlockmapRelease[] {
  const releases: BlockmapRelease[] = []
  for (const text of manifests) {
    const parsed = yaml.load(text) as { version?: unknown, files?: Array<{ url?: unknown }> } | null
    if (typeof parsed?.version !== 'string' || !Array.isArray(parsed.files)) continue
    const version = parsed.version
    let release = releases.find((r) => r.version === version)
    if (release === undefined) {
      release = { version, files: [] }
      releases.push(release)
    }
    for (const { url } of parsed.files) {
      if (typeof url !== 'string' || url === '') continue
      const name = `${url}.blockmap`
      if (!release.files.includes(name)) release.files.push(name)
    }
  }
  return releases
}

/** Newest first: published now, then carried by earlier builds; the build itself excluded. */
export function selectReleases (
  published: BlockmapRelease[],
  previous: BlockmapRelease[],
  currentVersion: string,
  limit: number
): BlockmapRelease[] {
  const selected: BlockmapRelease[] = []
  for (const release of [...published, ...previous]) {
    if (release.version === currentVersion) continue
    if (selected.some((r) => r.version === release.version)) continue
    selected.push(release)
  }
  return selected.slice(0, limit)
}

async function fetchText (url: string): Promise<string | undefined> {
  const res = await fetch(url)
  if (res.status === 404) return undefined
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`)
  return await res.text()
}

/**
 * Download blockmaps of up to `limit` previous releases from `baseUrl` into `dir` and write
 * the index the next build reads back. Returns the releases with the files actually present.
 */
export async function fetchPreviousBlockmaps (dir: string, baseUrl: string, limit: number): Promise<BlockmapRelease[]> {
  const current = yaml.load(fs.readFileSync(path.join(dir, 'latest.yml'), 'utf8')) as { version: string }
  const base = baseUrl.replace(/\/+$/, '')

  const manifests: string[] = []
  for (const name of MANIFESTS) {
    const text = await fetchText(`${base}/${name}`)
    if (text !== undefined) manifests.push(text)
  }
  const index = await fetchText(`${base}/${INDEX_FILE}`)
  const previous: BlockmapRelease[] = index !== undefined ? JSON.parse(index) : []

  const releases = selectReleases(releasesFromManifests(manifests), previous, current.version, limit)
  for (const release of releases) {
    const present: string[] = []
    for (const name of release.files) {
      const target = path.join(dir, path.basename(name))
      if (!fs.existsSync(target)) {
        const res = await fetch(`${base}/${encodeURIComponent(name)}`)
        if (!res.ok) {
          console.warn(`${release.version}: ${name} - HTTP ${res.status}, skipped`)
          continue
        }
        fs.writeFileSync(target, Buffer.from(await res.arrayBuffer()))
      }
      present.push(name)
    }
    release.files = present
  }

  const carried = releases.filter((r) => r.files.length > 0)
  fs.writeFileSync(path.join(dir, INDEX_FILE), JSON.stringify(carried, null, 2))
  return carried
}
