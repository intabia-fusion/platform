/**
  Copyright © 2026 Intabia Fusion.

  Licensed under the Eclipse Public License, Version 2.0 (the "License");
  you may not use this file except in compliance with the License. You may
  obtain a copy of the License at https://www.eclipse.org/legal/epl-2.0

  Unless required by applicable law or agreed to in writing, software
  distributed under the License is distributed on an "AS IS" BASIS,
  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.

  See the License for the specific language governing permissions and
  limitations under the License.
*/

import * as http from 'http'
import * as fs from 'fs'
import * as path from 'path'
import { createReadStream, statSync, readdirSync } from 'fs'
import * as yaml from 'js-yaml'
import * as crypto from 'crypto'

const PORT = parseInt(process.env.PORT ?? '4409', 10)
const DIST_DIR = process.env.DIST_DIR ?? '/app/dist'

// Content type mappings
const contentTypes: Record<string, string> = {
  '.yml': 'text/yaml',
  '.yaml': 'text/yaml',
  '.dmg': 'application/x-apple-diskimage',
  '.zip': 'application/zip',
  '.exe': 'application/x-msdownload',
  '.appimage': 'application/x-executable',
  '.deb': 'application/vnd.debian.binary-package',
  '.blockmap': 'application/octet-stream',
  '.json': 'application/json'
}

function getContentType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase()
  return contentTypes[ext] ?? 'application/octet-stream'
}

function getCorsHeaders(req: http.IncomingMessage): Record<string, string> {
  // Return a minimal but useful set of CORS headers. If Origin is a concrete
  // origin (not the literal "null") we echo it so credentials can be supported.
  // When Origin is missing or "null"/"undefined" we fall back to a wildcard
  // origin which is safe for anonymous cross-origin requests.
  const rawOrigin = req.headers.origin
  const origin = typeof rawOrigin === 'string' ? rawOrigin : String(rawOrigin ?? '')
  const headers: Record<string, string> = {
    'Access-Control-Expose-Headers': 'ETag, Last-Modified, Content-Length, Content-Range',
    'Vary': 'Origin'
  }

  // Some contexts (file://, data:, sandboxed iframes) send Origin: "null".
  // Treat these as absent to avoid reflecting a non-useful literal value.
  const isConcreteOrigin = origin !== '' && origin !== 'null' && origin !== 'undefined'

  if (isConcreteOrigin) {
    headers['Access-Control-Allow-Origin'] = origin
    // Only enable credentials when a concrete origin is present
    headers['Access-Control-Allow-Credentials'] = 'true'
  } else {
    headers['Access-Control-Allow-Origin'] = '*'
  }

  return headers
}

function sendJson(req: http.IncomingMessage, res: http.ServerResponse, statusCode: number, data: object, extraHeaders: Record<string, string> = {}): void {
  const json = JSON.stringify(data)
  res.writeHead(statusCode, {
    ...getCorsHeaders(req),
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(json),
    ...extraHeaders
  })
  res.end(json)
}

function sendFile(req: http.IncomingMessage, res: http.ServerResponse, filePath: string, range?: string): void {
  try {
    const stats = statSync(filePath)
    const contentType = getContentType(filePath)

    if (range !== undefined && typeof range === 'string') {
      // Handle range requests for large files
      const parts = range.replace(/bytes=/, '').split('-')
      const start = parseInt(parts[0], 10)
      const end = parts[1] !== '' ? parseInt(parts[1], 10) : stats.size - 1
      const chunkSize = end - start + 1

      res.writeHead(206, {
        ...getCorsHeaders(req),
        'Content-Range': `bytes ${start}-${end}/${stats.size}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': chunkSize,
        'Content-Type': contentType
      })

      createReadStream(filePath, { start, end }).pipe(res)
    } else {
      // Determine cache control
      const ext = path.extname(filePath).toLowerCase()
      const cacheControl = ext === '.yml' || ext === '.yaml' ? 'public, max-age=300' : 'public, max-age=3600'

      res.writeHead(200, {
        ...getCorsHeaders(req),
        'Content-Type': contentType,
        'Content-Length': stats.size,
        'Accept-Ranges': 'bytes',
        'Cache-Control': cacheControl
      })

      createReadStream(filePath).pipe(res)
    }
  } catch (error) {
    sendJson(req, res, 404, { error: 'File not found' })
  }
}

function listFiles(): Array<{ name: string; size: number; modified: string }> {
  try {
    const files = readdirSync(DIST_DIR)
    return files.map((filename) => {
      const filePath = path.join(DIST_DIR, filename)
      const stats = statSync(filePath)
      return {
        name: filename,
        size: stats.size,
        modified: stats.mtime.toISOString()
      }
    })
  } catch {
    return []
  }
}

interface DownloadArtifact {
  filename: string
  url: string
  size?: number
  modified?: string
  /**
   * Variant extracted from the manifest filename (e.g., 'x64', 'arm64').
   * Propagated from 'latest-linux-x64.yml' -> variant='x64'.
   */
  variant?: string
  /**
   * Architecture detected from the asset filename, e.g. 'arm64', 'x64', 'x86'
   * Populated heuristically based on filename patterns and platform.
   */
  arch?: string
  /**
   * Human-friendly platform + architecture label for UI, e.g. 'macOS - Apple Silicon'
   * Examples:
   *  - 'macOS - Apple Silicon' (arch: 'arm64')
   *  - 'macOS - Intel' (arch: 'x64')
   *  - 'Windows - x64', 'Windows - x86', 'Windows - ARM64'
   *  - 'Linux - x64', 'Linux - ARM64', 'Linux - x86'
   */
  archLabel?: string
  sha512?: string
  blockmap?: string
}

interface PlatformDownloads {
  platform: string
  manifest: string
  variant?: string
  version?: string
  releaseDate?: string
  artifacts: DownloadArtifact[]
  raw?: unknown
}

let cachedDownloads: { platforms: PlatformDownloads[]; lastUpdated: string | null } = { platforms: [], lastUpdated: null }
let cachedDownloadsEtag: string | null = null
let cachedDownloadsLastModified: string | null = null

/**
 * Normalize a download URL or path so it can be used in the UI.
 * If the value is an absolute http(s) url it's returned untouched,
 * otherwise we ensure it starts with a `/` so it can be resolved by the server.
 */
function normalizeDownloadUrl(value: string | undefined): string | undefined {
  if (!value) return undefined
  const str = String(value)
  if (/^https?:\/\//i.test(str)) return str
  if (str.startsWith('/')) return str
  return `/${str}`
}

/**
 * Extract artifacts from a parsed update manifest (latest.yml).
 * Handles common electron-builder manifest shapes.
 */
function extractArtifactsFromManifest(manifest: Record<string, any> | undefined): DownloadArtifact[] {
  const artifacts: DownloadArtifact[] = []
  if (!manifest) return artifacts

  const pushCandidate = (url: any, info?: any) => {
    if (!url) return
    const sUrl = String(url)
    const filename = path.basename(sUrl)
    artifacts.push({
      filename,
      url: normalizeDownloadUrl(sUrl) ?? sUrl,
      size: info?.size ?? info?.filesize,
      sha512: info?.sha512 ?? info?.sha2 ?? info?.sha1,
      blockmap: info?.blockmap ?? info?.blockMap
    })
  }

  if (Array.isArray(manifest.files)) {
    manifest.files.forEach((f: any) => {
      if (typeof f === 'string') pushCandidate(f)
      else {
        const url = f.url ?? f.path ?? f.file ?? f.name ?? f.filename
        pushCandidate(url, f)
      }
    })
  } else {
    const topLevel = manifest.path ?? manifest.url ?? manifest.file ?? manifest.updateFile
    if (topLevel) pushCandidate(topLevel, manifest)

    const candidates = manifest.packages ?? manifest.assets ?? manifest.distributions
    if (Array.isArray(candidates)) {
      candidates.forEach((p: any) => {
        const url = p.url ?? p.path ?? p.filename ?? p.name
        pushCandidate(url, p)
      })
    }
  }

  return artifacts
}

/**
 * Load all latest-*.yml / latest-*.yaml manifests from the distribution directory.
 * Returns a normalized structure convenient for UI consumption.
 */
function loadDownloads(): { platforms: PlatformDownloads[]; lastUpdated: string } {
  const lastUpdated = new Date().toISOString()
  try {
    const files = readdirSync(DIST_DIR).filter((f) => /^latest.*\.(yml|yaml)$/i.test(f))
    const filesMeta = listFiles()
    const filesMap = new Map(filesMeta.map((f) => [f.name, f]))
    const platforms = files.map((filename) => {
      const filePath = path.join(DIST_DIR, filename)
      let parsed: Record<string, any> | undefined
      try {
        const content = fs.readFileSync(filePath, 'utf8')
        parsed = yaml.load(content) as Record<string, any>
      } catch (err) {
        console.log('[server.loadDownloads] Failed to read/parse manifest', { file: filename, error: err })
      }

      // Extract platform and optional variant from manifest filename.
      // Examples:
      //  - latest.yml              -> platform = 'windows', variant = 'x64'
      //  - latest-linux.yml        -> platform = 'linux', variant = 'x64'
      //  - latest-linux-x64.yml    -> platform = 'linux', variant = 'x64'
      //  - latest-mac.yml          -> platform = 'mac', variant = undefined
      const base = filename.replace(/^latest-?/, '').replace(/\.(yml|yaml)$/i, '')
      let platform = 'windows'
      let variant: string | undefined = undefined
      if (!base || /^yml$|^yaml$/i.test(base)) {
        platform = 'windows'
      } else {
        const parts = base.split('-').filter(Boolean)
        platform = parts[0] ?? 'windows'
        if (parts.length > 1) variant = parts.slice(1).join('-')
      }
      // normalize common names
      if (/mac(?:os)?/.test(platform)) platform = 'mac'
      if (/linux/.test(platform)) platform = 'linux'
      if (/win/.test(platform) || filename === 'latest.yml') platform = 'windows'
      // Default variants when manifest filename does not include explicit arch
      // - latest-linux.yml  -> assume amd64
      // - latest.yml        -> assume amd64 (windows)
      if (platform === 'linux' && !variant) variant = 'x64'
      if (platform === 'windows' && /^(latest\.ya?ml)$/i.test(filename) && !variant) variant = 'x64'
      const version = parsed?.version ?? parsed?.appVersion ?? parsed?.version
      const releaseDate = parsed?.releaseDate ?? parsed?.pub_date ?? parsed?.publish_date

      const artifacts = extractArtifactsFromManifest(parsed)

      // Enrich artifacts with actual file metadata (size, modified) when available.
      // Prefer manifest-provided size but fall back to real file info from DIST_DIR.
      artifacts.forEach((a) => {
        const meta = filesMap.get(a.filename)
        if (meta) {
          a.size = a.size ?? meta.size
          a.modified = a.modified ?? meta.modified
        }
      })

      // Propagate manifest variant to artifacts and use it (if present) to determine arch/labels.
      artifacts.forEach((a) => {
        // propagate manifest variant (e.g. from latest-linux-x64.yml)
        if (variant) a.variant = variant

        const f = (a.filename ?? '').toLowerCase()

        // If manifest contains a variant, prefer it over filename heuristics
        if (variant) {
          const v = String(variant).toLowerCase()
          if (/(arm64|aarch64)/.test(v)) {
            a.arch = 'arm64'
            a.archLabel = platform === 'mac' ? 'macOS - Apple Silicon' : `${platform.charAt(0).toUpperCase() + platform.slice(1)} - ARM64`
            return
          }
          if (/(x64|x86_64|amd64)/.test(v)) {
            a.arch = 'x64'
            a.archLabel = platform === 'mac' ? 'macOS - Intel' : `${platform.charAt(0).toUpperCase() + platform.slice(1)} - x64`
            return
          }
          // otherwise attach raw variant for UI
          a.variant = variant
        }

        // Fallback: detect from filename
        if (platform === 'mac') {
          if (f.includes('arm') || f.includes('aarch64') || f.includes('arm64')) {
            a.arch = 'arm64'
            a.archLabel = 'macOS - Apple Silicon'
          } else {
            a.arch = 'x64'
            a.archLabel = 'macOS - Intel'
          }
        } else if (platform === 'windows') {
          if (f.includes('arm') || f.includes('arm64') || f.includes('aarch64')) {
            a.arch = 'arm64'
            a.archLabel = 'Windows - ARM64'
          } else if (f.includes('x86') && !f.includes('x64')) {
            a.arch = 'x86'
            a.archLabel = 'Windows - x86'
          } else {
            a.arch = 'x64'
            a.archLabel = 'Windows - x64'
          }
        } else if (platform === 'linux') {
          if (f.includes('arm') || f.includes('arm64') || f.includes('aarch64')) {
            a.arch = 'arm64'
            a.archLabel = 'Linux - ARM64'
          } else if (f.includes('x86') && !f.includes('x64')) {
            a.arch = 'x86'
            a.archLabel = 'Linux - x86'
          } else {
            a.arch = 'x64'
            a.archLabel = 'Linux - x64'
          }
        }
      })

      return {
        platform,
        manifest: filename,
        variant,
        version,
        releaseDate,
        artifacts,
        raw: parsed
      }
    })

    return { platforms, lastUpdated }
  } catch (err) {
    console.log('[server.loadDownloads] Error scanning dist dir', { error: err })
    return { platforms: [], lastUpdated }
  }
}

function generateEtag(data: any): string {
  return crypto.createHash('sha1').update(JSON.stringify(data)).digest('hex')
}

function updateCachedDownloads(): void {
  cachedDownloads = loadDownloads()
  cachedDownloadsEtag = generateEtag(cachedDownloads)
  cachedDownloadsLastModified = new Date(cachedDownloads.lastUpdated ?? new Date().toISOString()).toUTCString()
}

const server = http.createServer((req, res) => {
  const method = req.method ?? 'GET'
  const url = req.url ?? '/'

  // Request logging - helps diagnose blocked/failed requests (adblocker, mixed-content, etc.)
  // Shows method, url, origin header and remote address
  try {
    console.log(`[desktop-server] ${method} ${url} origin=${String(req.headers.origin ?? '-')} remote=${req.socket?.remoteAddress ?? '-'}`)
  } catch (e) {
    // Use a safe fallback to avoid crashing on unexpected values
    console.log('[desktop-server] request received')
  }

  // Handle CORS preflight
  if (method === 'OPTIONS') {
    const headers = {
      ...getCorsHeaders(req),
      'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Range, Accept, Authorization, X-Requested-With',
      'Access-Control-Max-Age': '86400'
    }
    res.writeHead(204, headers)
    res.end()
    return
  }

  // Only allow GET and HEAD
  if (method !== 'GET' && method !== 'HEAD') {
    sendJson(req, res, 405, { error: 'Method not allowed' })
    return
  }

  // Route handling
  const pathname = decodeURIComponent(url.split('?')[0])

  if (pathname === '/health') {
    sendJson(req, res, 200, { status: 'ok' })
    return
  }

  if (pathname === '/api/files') {
    sendJson(req, res, 200, { files: listFiles() })
    return
  }

  if (pathname === '/api/downloads') {
    // Support optional ?refresh=1 to reload manifests on demand
    // Debug logging for downloads endpoint - helpful when requests are blocked by client
    console.log(`[desktop-server] /api/downloads requested - url=${url} channel=${String(new URLSearchParams(String(url.split('?')[1] ?? '')).get('channel') ?? '-')} origin=${String(req.headers.origin ?? '-')} remote=${req.socket?.remoteAddress ?? '-'}`)
    const query = url.split('?')[1] ?? ''
    const params = new URLSearchParams(query)
    if (params.get('refresh') === '1') updateCachedDownloads()

    // Group manifests by platform so each platform appears exactly once.
    // Each platform object includes a human-readable `name` and a `variants` array.
    const groupedMap = new Map<string, { platform: string; name: string; variants: Array<{
      manifest: string
      variant?: string
      version?: string
      releaseDate?: string
      artifacts: DownloadArtifact[]
      raw?: any
    }> }>()
    cachedDownloads.platforms.forEach((m) => {
      const key = m.platform ?? 'unknown'
      if (!groupedMap.has(key)) {
        const humanName = (() => {
          if (key === 'mac') return 'macOS'
          if (key === 'linux') return 'Linux'
          if (key === 'windows') return 'Windows'
          return key
        })()
        groupedMap.set(key, { platform: key, name: humanName, variants: [] })
      }
      const group = groupedMap.get(key)!
      group.variants.push({
        manifest: m.manifest,
        variant: m.variant,
        version: m.version,
        releaseDate: m.releaseDate,
        artifacts: m.artifacts,
        raw: m.raw
      })
    })

    const grouped = Array.from(groupedMap.values())
    const requestedChannel = params.get('channel') ?? null
    const result = { platforms: grouped, lastUpdated: cachedDownloads.lastUpdated, channel: requestedChannel }
    const payload = JSON.stringify(result)

    // Compute ETag from the grouped payload so conditional GETs match the returned shape
    const hash = crypto.createHash('sha1').update(payload).digest('hex')
    const currentEtag = `\"${hash}\"`
    const currentLastModified = cachedDownloadsLastModified

    const ifNoneMatch = String(req.headers['if-none-match'] ?? '')
    const ifModifiedSince = String(req.headers['if-modified-since'] ?? '')

    // ETag check
    if (ifNoneMatch) {
      const tokens = ifNoneMatch.split(',').map((t) => t.trim())
      if (tokens.includes(currentEtag) || tokens.includes(hash)) {
        res.writeHead(304, { 'ETag': currentEtag, ...getCorsHeaders(req) })
        res.end()
        return
      }
    }

    // If-Modified-Since check
    if (ifModifiedSince && currentLastModified) {
      const ims = new Date(ifModifiedSince)
      const lm = new Date(currentLastModified)
      if (!isNaN(ims.getTime()) && lm <= ims) {
        res.writeHead(304, { 'ETag': currentEtag, 'Last-Modified': currentLastModified, ...getCorsHeaders(req) })
        res.end()
        return
      }
    }

    const headers = {
      ...getCorsHeaders(req),
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(payload),
      'ETag': currentEtag,
      ...(currentLastModified ? { 'Last-Modified': currentLastModified } : {})
    }

    if (method === 'HEAD') {
      res.writeHead(200, headers)
      res.end()
      return
    }

    res.writeHead(200, headers)
    res.end(payload)
    return
  }

  // Serve static files
  const filename = pathname === '/' ? 'index.html' : pathname.slice(1)

  // Security: prevent directory traversal
  const safePath = path.normalize(filename).replace(/^(\.\.[/\\])+/, '')
  const filePath = path.join(DIST_DIR, safePath)

  // Ensure file is within DIST_DIR
  if (!filePath.startsWith(path.resolve(DIST_DIR))) {
    sendJson(req, res, 403, { error: 'Forbidden' })
    return
  }

  // Check if file exists
  if (!fs.existsSync(filePath) || !statSync(filePath).isFile()) {
    sendJson(req, res, 404, { error: 'File not found' })
    return
  }

  // Handle range requests
  const range = req.headers.range as string | undefined
  sendFile(req, res, filePath, range)
})

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Desktop distribution server started on port ${PORT}`)
  console.log(`Serving files from: ${DIST_DIR}`)

  // List available files on startup
  const files = listFiles()
  if (files.length > 0) {
    console.log(`Available files (${files.length}):`)
    files.forEach((file) => {
      const sizeMB = (file.size / 1024 / 1024).toFixed(2)
      console.log(`  - ${file.name} (${sizeMB} MB)`)
    })
  } else {
    console.log('Distribution directory not found or empty')
  }

  // Load download manifests (latest-*.yml / latest-*.yaml)
  updateCachedDownloads()
  if (cachedDownloads.lastUpdated) {
    console.log(`Manifests last updated: ${cachedDownloads.lastUpdated}`)
  }
  if (cachedDownloads.platforms.length > 0) {
    console.log('Loaded download manifests:')
    cachedDownloads.platforms.forEach((p) => {
      console.log(`  - ${p.platform}${p.variant ? '/' + p.variant : ''}: ${p.manifest} => ${p.artifacts.length} artifact(s)`)
      p.artifacts.forEach((a) => console.log(`      * ${a.filename} (${a.url})`))
    })
  } else {
    console.log('No download manifests found (no latest-*.yml files)')
  }
})
