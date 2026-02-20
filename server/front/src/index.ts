//
// Copyright © 2020, 2021 Anticrm Platform Contributors.
// Copyright © 2021, 2025 Hardcore Engineering Inc.
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

import { Analytics } from '@hcengineering/analytics'
import { MeasureContext, Blob as PlatformBlob, WorkspaceIds, metricsAggregate } from '@hcengineering/core'
import platform, { PlatformError } from '@hcengineering/platform'
import { TokenError, decodeToken } from '@hcengineering/server-token'
import { StorageAdapter } from '@hcengineering/storage'
import bp from 'body-parser'
import cors from 'cors'
import express, { Request, Response } from 'express'
import fileUpload, { UploadedFile } from 'express-fileupload'
import https from 'https'
import morgan from 'morgan'
import { join, resolve } from 'path'
import { cwd } from 'process'
import { v4 as uuid } from 'uuid'
import { getClient as getAccountClient } from '@hcengineering/account-client'
import { preConditions } from './utils'

import fs, { mkdtempSync } from 'fs'
import { tmpdir } from 'os'
import crypto from 'crypto'

// Long-term cache for files with content hash in filename (immutable assets)
const cacheControlImmutable = 'public, max-age=31536000, immutable'
// Short cache with ETag revalidation for files without hash
const cacheControlRevalidate = 'public, no-cache'
// No cache for dynamic content (index.html, config.json)
const cacheControlNoCache = 'public, no-store, no-cache, must-revalidate, max-age=0'

// Check if filename contains a content hash (e.g., main.a1b2c3d4.js.gz or chunk-abc123.css.gz)
function hasContentHash (fileName: string): boolean {
  // Remove .gz or .br suffix for checking
  let name = fileName
  if (name.endsWith('.gz')) {
    name = name.slice(0, -3)
  } else if (name.endsWith('.br')) {
    name = name.slice(0, -3)
  }
  // Match patterns like: name.HASH.ext where HASH is 6+ hex chars
  return /\.[0-9a-f]{6,}\.\w+$/i.test(name)
}

const KEEP_ALIVE_TIMEOUT = 60 // seconds
const KEEP_ALIVE_MAX = 1000
const KEEP_ALIVE_HEADERS = {
  Connection: 'keep-alive',
  'Keep-Alive': `timeout=${KEEP_ALIVE_TIMEOUT}, max=${KEEP_ALIVE_MAX}`
}

async function storageUpload (
  ctx: MeasureContext,
  storageAdapter: StorageAdapter,
  wsIds: WorkspaceIds,
  file: UploadedFile
): Promise<{ uuid: string, etag: string }> {
  const uuid = file.name
  const data = file.tempFilePath !== undefined ? fs.createReadStream(file.tempFilePath) : file.data
  const resp = await ctx.with(
    'storage upload',
    {},
    (ctx) => storageAdapter.put(ctx, wsIds, uuid, data, file.mimetype, file.size),
    { file: file.name, contentType: file.mimetype, workspace: wsIds.uuid }
  )

  ctx.info('storage upload', resp)
  return { uuid, etag: resp.etag }
}

function getRange (range: string, size: number): [number, number] {
  const [startStr, endStr] = range.replace(/bytes=/, '').split('-')

  let start = parseInt(startStr, 10)
  let end = endStr !== undefined ? parseInt(endStr, 10) : size - 1

  if (!isNaN(start) && isNaN(end)) {
    end = size - 1
  }

  if (isNaN(start) && !isNaN(end)) {
    start = size - end
    end = size - 1
  }

  return [start, end]
}

async function getFileRange (
  ctx: MeasureContext,
  stat: PlatformBlob,
  range: string,
  client: StorageAdapter,
  wsIds: WorkspaceIds,
  res: Response
): Promise<void> {
  const uuid = stat._id
  const size: number = stat.size

  const [start, end] = getRange(range, size)

  if (start >= size || end >= size) {
    res.writeHead(416, {
      'Content-Range': `bytes */${size}`
    })
    res.end()
    return
  }

  await ctx.with(
    'write',
    { contentType: stat.contentType },
    async (ctx) => {
      try {
        const dataStream = await ctx.with(
          'partial',
          {},
          (ctx) => client.partial(ctx, wsIds, stat._id, start, end - start + 1),
          {}
        )
        res.writeHead(206, {
          ...KEEP_ALIVE_HEADERS,
          'Content-Range': `bytes ${start}-${end}/${size}`,
          'Accept-Ranges': 'bytes',
          'Content-Length': end - start + 1,
          'Content-Type': stat.contentType,
          'Content-Security-Policy': "default-src 'none';",
          Etag: stat.etag,
          'Last-Modified': new Date(stat.modifiedOn).toISOString()
        })

        dataStream.pipe(res)

        await new Promise<void>((resolve, reject) => {
          dataStream.on('end', () => {
            dataStream.destroy()
            res.end()
            resolve()
          })
          dataStream.on('error', (err) => {
            ctx.error('error receive stream', { workspace: wsIds.uuid, uuid, error: err })
            Analytics.handleError(err)

            res.end()
            dataStream.destroy()
            reject(err)
          })
        })
      } catch (err: any) {
        if (
          err?.code === 'NoSuchKey' ||
          err?.code === 'NotFound' ||
          err?.message === 'No such key' ||
          err?.Code === 'NoSuchKey'
        ) {
          ctx.info('No such key', { workspace: wsIds.uuid, uuid })
          res.status(404).send()
          return
        } else {
          Analytics.handleError(err)
          ctx.error(err)
        }
        res.status(500).send()
      }
    },
    { uuid, start, end: end - start + 1 }
  )
}

async function getFile (
  ctx: MeasureContext,
  stat: PlatformBlob,
  client: StorageAdapter,
  wsIds: WorkspaceIds,
  req: Request,
  res: Response
): Promise<void> {
  const etag = stat.etag

  if (
    preConditions.IfNoneMatch(req.headers, { etag }) === 'notModified' ||
    preConditions.IfMatch(req.headers, { etag }) === 'notModified' ||
    preConditions.IfModifiedSince(req.headers, { lastModified: new Date(stat.modifiedOn) }) === 'notModified'
  ) {
    // Matched, return not modified
    res.writeHead(304, {
      ...KEEP_ALIVE_HEADERS,
      'content-type': stat.contentType,
      etag: stat.etag,
      'last-modified': new Date(stat.modifiedOn).toISOString(),
      'cache-control': cacheControlRevalidate
    })
    res.end()
    return
  }
  if (preConditions.IfUnmodifiedSince(req.headers, { lastModified: new Date(stat.modifiedOn) }) === 'failed') {
    // Send 412 (Precondition Failed)
    res.writeHead(412, {
      ...KEEP_ALIVE_HEADERS,
      'content-type': stat.contentType,
      etag: stat.etag,
      'last-modified': new Date(stat.modifiedOn).toISOString(),
      'cache-control': cacheControlRevalidate
    })
    res.end()
    return
  }

  await ctx.with(
    'write',
    { contentType: stat.contentType },
    async (ctx) => {
      try {
        const dataStream = await ctx.with('readable', {}, (ctx) => client.get(ctx, wsIds, stat._id))
        res.writeHead(200, {
          'Content-Type': stat.contentType,
          'Content-Security-Policy': "default-src 'none';",
          'Content-Length': stat.size,
          Etag: stat.etag,
          'Last-Modified': new Date(stat.modifiedOn).toISOString(),
          'Cache-Control': cacheControlRevalidate,
          connection: 'keep-alive',
          'keep-alive': 'timeout=5, max=1000'
        })

        dataStream.pipe(res)
        await new Promise<void>((resolve, reject) => {
          dataStream.on('end', function () {
            res.end()
            dataStream.destroy()
            resolve()
          })
          dataStream.on('error', function (err) {
            Analytics.handleError(err)
            ctx.error('error', { err })

            res.end()
            dataStream.destroy()
            reject(err)
          })
        })
      } catch (err: any) {
        ctx.error('get-file-error', { workspace: wsIds.uuid, err })
        Analytics.handleError(err)
        res.status(500).send()
      }
    },
    {}
  )
}

/**
 * @public
 * @param port -
 */
export function start (
  ctx: MeasureContext,
  config: {
    storageAdapter: StorageAdapter
    accountsUrl: string
    accountsUrlInternal?: string
    uploadUrl: string
    filesUrl: string
    modelVersion: string
    version: string
    rekoniUrl: string
    telegramUrl: string
    gmailUrl: string
    calendarUrl: string
    collaborator?: string
    collaboratorUrl: string
    brandingUrl?: string
    previewUrl?: string
    linkPreviewUrl?: string
    pushPublicKey?: string
    disableSignUp?: string
    hideLocalLogin?: string
    streamUrl?: string
    billingUrl?: string
    paymentUrl?: string
    pulseUrl?: string
    hulylakeUrl?: string
    datalakeUrl?: string
  },
  port: number,
  extraConfig?: Record<string, string | undefined>
): () => void {
  const app = express()

  const tempFileDir = mkdtempSync(join(tmpdir(), 'front-'))

  function cleanupTempFiles (): void {
    const maxAge = 1000 * 60 * 60 // 1 hour
    fs.readdir(tempFileDir, (err, files) => {
      if (err != null) return
      files.forEach((file) => {
        const filePath = join(tempFileDir, file)
        fs.stat(filePath, (err, stats) => {
          if (err != null) return
          if (Date.now() - stats.mtime.getTime() > maxAge) {
            fs.unlink(filePath, () => {})
          }
        })
      })
    })
  }

  setInterval(cleanupTempFiles, 1000 * 60 * 15) // Run every 15 minutes

  app.use(cors())
  app.use(
    fileUpload({
      useTempFiles: true,
      tempFileDir
    })
  )
  app.use(bp.json())
  app.use(bp.urlencoded({ extended: true }))

  const childLogger = ctx.logger.childLogger?.('requests', {
    enableConsole: 'true'
  })
  const requests = ctx.newChild('requests', {}, { logger: childLogger, span: false })

  class MyStream {
    write (text: string): void {
      requests.info(text)
    }
  }

  const myStream = new MyStream()

  app.use(morgan('short', { stream: myStream }))

  // Pre-serialize config.json for optimal performance
  const configData = {
    ACCOUNTS_URL: config.accountsUrl,
    UPLOAD_URL: config.uploadUrl,
    FILES_URL: config.filesUrl,
    MODEL_VERSION: config.modelVersion,
    VERSION: config.version,
    REKONI_URL: config.rekoniUrl,
    TELEGRAM_URL: config.telegramUrl,
    GMAIL_URL: config.gmailUrl,
    CALENDAR_URL: config.calendarUrl,
    COLLABORATOR: config.collaborator,
    LINK_PREVIEW_URL: config.linkPreviewUrl,
    STREAM_URL: config.streamUrl,
    COLLABORATOR_URL: config.collaboratorUrl,
    BRANDING_URL: config.brandingUrl,
    PREVIEW_URL: config.previewUrl,
    PUSH_PUBLIC_KEY: config.pushPublicKey,
    DISABLE_SIGNUP: config.disableSignUp,
    HIDE_LOCAL_LOGIN: config.hideLocalLogin,
    BILLING_URL: config.billingUrl,
    PAYMENT_URL: config.paymentUrl,
    PULSE_URL: config.pulseUrl,
    HULYLAKE_URL: config.hulylakeUrl,
    DATALAKE_URL: config.datalakeUrl,
    ...(extraConfig ?? {})
  }
  const cachedConfigJson = JSON.stringify(configData)
  // Generate weak ETag same format as Express: W/"<base64>"
  const hash = crypto.createHash('md5').update(cachedConfigJson).digest('base64')
  const cachedConfigEtag = `W/"${hash}"`
  const cachedConfigLength = Buffer.byteLength(cachedConfigJson, 'utf8')

  // Optimized config.json endpoint - define BEFORE static middleware
  app.get('/config.json', (req, res) => {
    // Check If-None-Match for 304 Not Modified
    if (req.headers['if-none-match'] === cachedConfigEtag) {
      res.writeHead(304, { ETag: cachedConfigEtag })
      res.end()
      return
    }

    // Send pre-serialized response using writeHead to set all headers at once
    res.writeHead(200, {
      'Content-Type': 'application/json',
      ETag: cachedConfigEtag,
      'Content-Length': String(cachedConfigLength),
      'Cache-Control': 'public, max-age=60',
      Connection: 'keep-alive',
      'Keep-Alive': `timeout=${KEEP_ALIVE_TIMEOUT}, max=${KEEP_ALIVE_MAX}`,
      'Access-Control-Allow-Origin': '*'
    })
    res.end(cachedConfigJson)
  })

  app.get('/api/v1/statistics', (req, res) => {
    try {
      const token = req.query.token as string
      const payload = decodeToken(token)
      const admin = payload.extra?.admin === 'true'
      res.status(200)
      res.setHeader('Content-Type', 'application/json')
      res.setHeader('Connection', 'keep-alive')
      res.setHeader('Keep-Alive', 'timeout=5')
      res.setHeader('Cache-Control', cacheControlNoCache)

      const json = JSON.stringify({
        metrics: metricsAggregate((ctx as any).metrics),
        statistics: {
          activeSessions: {}
        },
        admin
      })
      res.end(json)
    } catch (err: any) {
      if (err instanceof TokenError) {
        res.status(401).send()
        return
      }
      ctx.error('statistics error', { err })
      Analytics.handleError(err)
      res.status(404).send()
    }
  })

  const dist = resolve(process.env.PUBLIC_DIR ?? cwd(), 'dist')
  console.log('serving static files from', dist)

  // Pre-load and cache index.html as Buffer for optimal performance (avoids string→Buffer on each response)
  const indexPath = join(dist, 'index.html')
  let cachedIndexHtml: Buffer | null = null
  let cachedIndexEtag: string | null = null
  let cachedIndexLength: number = 0
  let cachedIndexHeaders: Record<string, string> | null = null

  try {
    cachedIndexHtml = fs.readFileSync(indexPath)
    const hash = crypto.createHash('md5').update(cachedIndexHtml).digest('base64')
    cachedIndexEtag = `W/"${hash}"`
    cachedIndexLength = cachedIndexHtml.length
    cachedIndexHeaders = {
      'Content-Type': 'text/html; charset=UTF-8',
      ETag: cachedIndexEtag,
      'Content-Length': String(cachedIndexLength),
      'Cache-Control': cacheControlNoCache,
      Connection: 'keep-alive',
      'Keep-Alive': `timeout=${KEEP_ALIVE_TIMEOUT}, max=${KEEP_ALIVE_MAX}`,
      'Access-Control-Allow-Origin': '*'
    }
    console.log(`Pre-loaded index.html (${cachedIndexLength} bytes, ETag: ${cachedIndexEtag})`)
  } catch (err: any) {
    console.warn('Could not pre-load index.html, will use static middleware:', err.message)
  }

  // Helper: serve cached index.html, returns true if served
  function serveCachedIndex (req: Request, res: Response): boolean {
    if (cachedIndexHtml === null || cachedIndexEtag === null || cachedIndexHeaders === null) {
      return false
    }
    if (req.headers['if-none-match'] === cachedIndexEtag) {
      res.writeHead(304, { ETag: cachedIndexEtag })
      res.end()
      return true
    }
    res.writeHead(200, cachedIndexHeaders)
    res.end(cachedIndexHtml)
    return true
  }

  // Known files Set - all files in dist
  const knownFiles = new Set<string>()
  // Disk files - not cached in memory, served from disk via sendFile (which handles ETag/304 natively)
  // lastModified is stored for proper HTTP headers
  const diskFiles = new Map<string, { fullPath: string, cacheControl: string, lastModified: Date }>()
  // Memory cache for files with pre-computed headers
  const fileCache = new Map<
  string,
  {
    content: Buffer
    etag: string
    contentType: string
    size: number
    isGz: boolean
    isBr: boolean
    headers200: Record<string, string>
    headers304: Record<string, string>
  }
  >()

  function getContentType (ext: string): string {
    const types: Record<string, string> = {
      js: 'application/javascript',
      mjs: 'application/javascript',
      css: 'text/css',
      html: 'text/html',
      json: 'application/json',
      svg: 'image/svg+xml',
      png: 'image/png',
      jpg: 'image/jpeg',
      jpeg: 'image/jpeg',
      gif: 'image/gif',
      ico: 'image/x-icon',
      woff: 'font/woff',
      woff2: 'font/woff2',
      ttf: 'font/ttf',
      eot: 'application/vnd.ms-fontobject',
      webp: 'image/webp',
      avif: 'image/avif',
      gz: 'application/gzip'
    }
    return types[ext] ?? 'application/octet-stream'
  }

  // Cache files in memory for maximum throughput
  // Skip: source maps, uncompressed .js/.css/.svg only if they have .gz/.br versions
  function shouldCacheFile (fileName: string, hasGzVersion: boolean, hasBrVersion: boolean): boolean {
    // Always skip source maps
    if (fileName.endsWith('.map.gz') || fileName.endsWith('.map.br') || fileName.endsWith('.map')) return false
    // Skip uncompressed .js/.css/.svg only if there's a compressed version available
    if (!fileName.endsWith('.gz') && !fileName.endsWith('.br')) {
      if (fileName.endsWith('.js') || fileName.endsWith('.css') || fileName.endsWith('.svg')) {
        if (hasGzVersion || hasBrVersion) return false
      }
    }
    return true
  }

  // Load file into memory cache with pre-computed headers
  function loadFileToCache (
    filePath: string,
    urlPath: string,
    isGzFile: boolean,
    isBrFile: boolean,
    lastModified: Date
  ): boolean {
    try {
      if (fileCache.has(urlPath)) return true

      const content = fs.readFileSync(filePath)
      const hash = crypto.createHash('md5').update(content).digest('base64')
      const etag = `W/"${hash}"`

      // Get content type from extension
      let ext: string
      if (isGzFile || isBrFile) {
        const extParts = filePath.split('.')
        ext =
          extParts.length > 2
            ? extParts[extParts.length - 2].toLowerCase()
            : extParts.length > 1
              ? extParts[extParts.length - 1].toLowerCase()
              : ''
      } else {
        ext = filePath.split('.').pop()?.toLowerCase() ?? ''
      }
      const contentType = getContentType(ext)

      // Choose Cache-Control (accounts for branding URL and content hash)
      const fileName = urlPath.split('/').pop() ?? ''
      const cacheControl = getCacheControl(urlPath, fileName)

      const lastModifiedStr = lastModified.toUTCString()

      // Pre-compute headers for 200 and 304 responses
      const headers200: Record<string, string> = {
        'Content-Type': contentType,
        ETag: etag,
        'Content-Length': String(content.length),
        'Accept-Ranges': 'bytes',
        'Cache-Control': cacheControl,
        'Last-Modified': lastModifiedStr,
        Connection: 'keep-alive',
        'Keep-Alive': `timeout=${KEEP_ALIVE_TIMEOUT}, max=${KEEP_ALIVE_MAX}`
      }
      if (isGzFile) {
        headers200['Content-Encoding'] = 'gzip'
      } else if (isBrFile) {
        headers200['Content-Encoding'] = 'br'
      }

      const headers304: Record<string, string> = {
        ETag: etag,
        'Last-Modified': lastModifiedStr
      }

      fileCache.set(urlPath, {
        content,
        etag,
        contentType,
        size: content.length,
        isGz: isGzFile,
        isBr: isBrFile,
        headers200,
        headers304
      })
      return true
    } catch (err) {
      return false
    }
  }

  // Two-pass file collection for proper compression tracking
  // Stores file info with lastModified (from fs.stat, collected once)
  const allFiles = new Map<
  string,
  { fullPath: string, hasGzVersion: boolean, hasBrVersion: boolean, lastModified: Date }
  >()
  const compressedFiles = new Map<string, { isGz: boolean, isBr: boolean }>()

  // First pass: collect all files (both compressed and uncompressed)
  // fs.statSync is called only once per file here
  function collectFiles (dir: string, basePath: string = ''): void {
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true })

      for (const entry of entries) {
        const fullPath = join(dir, entry.name)
        const relativePath = basePath !== '' ? `${basePath}/${entry.name}` : entry.name

        if (entry.isDirectory()) {
          collectFiles(fullPath, relativePath)
        } else {
          const urlPath = `/${relativePath}`
          const isGzFile = entry.name.endsWith('.gz')
          const isBrFile = entry.name.endsWith('.br')

          // Get file stats once (only for mtime)
          let lastModified: Date
          try {
            const stats = fs.statSync(fullPath)
            lastModified = stats.mtime
          } catch {
            lastModified = new Date(0)
          }

          if (isGzFile || isBrFile) {
            // Track compressed file for second pass
            compressedFiles.set(urlPath, { isGz: isGzFile, isBr: isBrFile })
            allFiles.set(urlPath, { fullPath, hasGzVersion: false, hasBrVersion: false, lastModified })
          } else {
            // Regular file - will update compression flags in second pass
            allFiles.set(urlPath, { fullPath, hasGzVersion: false, hasBrVersion: false, lastModified })
          }
        }
      }
    } catch (err) {
      console.warn(`Error scanning directory ${dir}:`, err)
    }
  }

  // Second pass: determine compression relationships
  function processCompressionRelationships (): void {
    for (const [compressedPath, { isGz, isBr }] of compressedFiles) {
      const uncompressedPath = compressedPath.slice(0, -3) // Remove .gz or .br
      const uncompressedEntry = allFiles.get(uncompressedPath)
      if (uncompressedEntry !== undefined) {
        if (isGz) {
          uncompressedEntry.hasGzVersion = true
        } else if (isBr) {
          uncompressedEntry.hasBrVersion = true
        }
      }
    }
  }

  // Collect all files first
  console.log('Collecting dist files...')
  collectFiles(dist)
  processCompressionRelationships()

  // Parse branding URL for cache-control decisions
  let brandingPath: string | undefined
  if (config.brandingUrl !== undefined) {
    try {
      brandingPath = new URL(config.brandingUrl).pathname
    } catch (e) {
      console.error('Invalid branding URL. Must be absolute URL.', e)
    }
  }

  // Determine cache-control for a given URL path
  function getCacheControl (urlPath: string, fileName: string): string {
    // Branding files and index.html get no-cache
    if (
      fileName === 'index.html' ||
      (brandingPath !== undefined && urlPath.toLowerCase().includes(brandingPath.toLowerCase()))
    ) {
      return cacheControlNoCache
    }
    return hasContentHash(fileName) ? cacheControlImmutable : cacheControlRevalidate
  }

  // Now decide what to cache
  let gzCached = 0
  let brCached = 0
  let uncompressedCached = 0

  for (const [urlPath, { fullPath, hasGzVersion, hasBrVersion, lastModified }] of allFiles) {
    knownFiles.add(urlPath)

    const fileName = urlPath.split('/').pop() ?? ''
    const isGzFile = fileName.endsWith('.gz')
    const isBrFile = fileName.endsWith('.br')

    if (shouldCacheFile(fileName, hasGzVersion, hasBrVersion)) {
      if (loadFileToCache(fullPath, urlPath, isGzFile, isBrFile, lastModified)) {
        if (isGzFile) {
          gzCached++
        } else if (isBrFile) {
          brCached++
        } else {
          uncompressedCached++
        }
      }
    } else {
      // Not cached in memory — sendFile handles ETag/304 natively
      // Pass lastModified for proper If-Modified-Since handling
      diskFiles.set(urlPath, {
        fullPath,
        cacheControl: getCacheControl(urlPath, fileName),
        lastModified
      })
    }
  }

  // Free allFiles map - no longer needed after initialization
  allFiles.clear()

  console.log(
    `Found ${knownFiles.size} files, cached ${gzCached} .gz + ${brCached} .br + ${uncompressedCached} uncompressed files in memory, ${diskFiles.size} served from disk`
  )

  // Optimized index.html endpoint - define BEFORE static middleware
  app.get(['/index.html', '/'], (req, res, next) => {
    if (!serveCachedIndex(req, res)) {
      next()
    }
  })

  // Helper functions for conditional requests
  function parseRange (range: string, size: number): [number, number] | null {
    const match = range.match(/bytes=(\d*)-(\d*)/)
    if (match === null) return null

    let start = parseInt(match[1], 10)
    let end = parseInt(match[2], 10)

    if (isNaN(start)) {
      // Suffix range: bytes=-500 (last 500 bytes)
      if (!isNaN(end)) {
        start = size - end
        end = size - 1
      } else {
        return null
      }
    } else if (isNaN(end)) {
      // Open-ended: bytes=500- (from 500 to end)
      end = size - 1
    }

    if (start > end || start >= size) {
      return null
    }

    end = Math.min(end, size - 1)
    return [start, end]
  }

  function checkPreconditions (req: Request, etag: string, lastModified: Date): number | null {
    const ifMatch = req.headers['if-match']
    const ifNoneMatch = req.headers['if-none-match']
    const ifModifiedSince = req.headers['if-modified-since']
    const ifUnmodifiedSince = req.headers['if-unmodified-since']

    // If-Match: return 412 if etag doesn't match
    if (ifMatch !== undefined && ifMatch !== '' && ifMatch !== '*' && ifMatch !== etag) {
      return 412
    }

    // If-None-Match: return 304 for GET/HEAD if etag matches
    if (ifNoneMatch !== undefined && ifNoneMatch !== '' && (ifNoneMatch === '*' || ifNoneMatch === etag)) {
      if (req.method === 'GET' || req.method === 'HEAD') {
        return 304
      }
      return 412
    }

    // If-Modified-Since: return 304 if not modified
    if (ifModifiedSince !== undefined && ifModifiedSince !== '' && (ifNoneMatch === undefined || ifNoneMatch === '')) {
      const modifiedSince = new Date(ifModifiedSince)
      if (lastModified <= modifiedSince) {
        return 304
      }
    }

    // If-Unmodified-Since: return 412 if modified after date
    if (ifUnmodifiedSince !== undefined && ifUnmodifiedSince !== '') {
      const unmodifiedSince = new Date(ifUnmodifiedSince)
      if (lastModified > unmodifiedSince) {
        return 412
      }
    }

    return null
  }

  // Parse Accept-Encoding header to determine preferred encoding
  // Returns 'br', 'gzip', or undefined
  function getPreferredEncoding (acceptEncoding: string | undefined): 'br' | 'gzip' | undefined {
    if (acceptEncoding === undefined) return undefined
    // Brotli is preferred over gzip (better compression)
    if (acceptEncoding.includes('br')) return 'br'
    if (acceptEncoding.includes('gzip')) return 'gzip'
    return undefined
  }

  // Static files middleware - serve from memory cache or disk
  app.use((req, res, next) => {
    // Skip API routes
    if (req.path.startsWith('/api/') || req.path.startsWith('/files')) {
      next()
      return
    }

    // Check if file exists in known files
    if (!knownFiles.has(req.path)) {
      next()
      return
    }

    // File exists - check if cached in memory
    let cached = fileCache.get(req.path)

    // If not cached and not already a compressed file, check for compressed versions
    if (cached === undefined && !req.path.endsWith('.gz') && !req.path.endsWith('.br')) {
      const preferredEncoding = getPreferredEncoding(req.headers['accept-encoding'])
      if (preferredEncoding === 'br') {
        cached = fileCache.get(`${req.path}.br`)
      } else if (preferredEncoding === 'gzip') {
        cached = fileCache.get(`${req.path}.gz`)
      }
    }

    if (cached === undefined) {
      // Serve from disk — sendFile handles ETag, If-None-Match, 304 natively
      const diskEntry = diskFiles.get(req.path)
      if (diskEntry !== undefined) {
        res.sendFile(diskEntry.fullPath, {
          headers: {
            'Cache-Control': diskEntry.cacheControl,
            'Last-Modified': diskEntry.lastModified.toUTCString(),
            Connection: 'keep-alive',
            'Keep-Alive': `timeout=${KEEP_ALIVE_TIMEOUT}, max=${KEEP_ALIVE_MAX}`
          },
          etag: true,
          lastModified: false // We set it explicitly above
        })
        return
      }
      next()
      return
    }

    // Check preconditions (If-Match, If-None-Match, If-Modified-Since, If-Unmodified-Since)
    const preconditionStatus = checkPreconditions(req, cached.etag, new Date(0))
    if (preconditionStatus !== null) {
      if (preconditionStatus === 304) {
        res.writeHead(304, cached.headers304)
      } else {
        res.writeHead(preconditionStatus)
      }
      res.end()
      return
    }

    // Check for Range request
    const range = req.headers.range
    if (range !== undefined) {
      const parsedRange = parseRange(range, cached.size)
      if (parsedRange !== null) {
        const [start, end] = parsedRange
        res.writeHead(206, {
          'Content-Type': cached.contentType,
          'Content-Range': `bytes ${start}-${end}/${cached.size}`,
          'Content-Length': String(end - start + 1),
          'Accept-Ranges': 'bytes',
          ETag: cached.etag,
          'Cache-Control': cached.headers200['Cache-Control'],
          Connection: 'keep-alive',
          'Keep-Alive': `timeout=${KEEP_ALIVE_TIMEOUT}, max=${KEEP_ALIVE_MAX}`
        })
        res.end(cached.content.subarray(start, end + 1))
      } else {
        res.writeHead(416, { 'Content-Range': `bytes */${cached.size}` })
        res.end()
      }
      return
    }

    // Serve from memory cache with pre-computed headers
    res.writeHead(200, cached.headers200)
    res.end(cached.content)
  })

  const getWorkspaceIds = async (ctx: MeasureContext, token: string, path?: string): Promise<WorkspaceIds | null> => {
    const accountClient = getAccountClient(config.accountsUrlInternal ?? config.accountsUrl, token)
    const workspaceInfo = await accountClient.getWorkspaceInfo()
    const wsIds = {
      uuid: workspaceInfo.uuid,
      dataId: workspaceInfo.dataId,
      url: workspaceInfo.url
    }
    if (path === undefined) {
      return wsIds
    }

    const actualUuid = workspaceInfo.uuid
    const expectedUuid = path.split('/')[2]
    if (expectedUuid !== undefined && actualUuid !== expectedUuid) {
      ctx.error('Cannot validate uuid', {
        expectedUuid,
        actualUuid,
        path,
        workspaceUuid: workspaceInfo.uuid,
        workspaceDataId: workspaceInfo.dataId
      })
      return null
    }

    return wsIds
  }

  const filesHandler = async (req: Request<any>, res: Response<any>): Promise<void> => {
    await ctx.with(
      'handle-file',
      {},
      async (ctx) => {
        try {
          const cookies = ((req?.headers?.cookie as string) ?? '').split(';').map((it) => it.trim().split('='))

          const authorization = ((req?.headers?.authorization as string) ?? '').split(' ')
          const authorizationToken = authorization.at(0)?.toLowerCase() === 'bearer' ? authorization.at(1) : undefined
          const token =
            cookies.find((it) => it[0] === 'presentation-metadata-Token')?.[1] ??
            (req.query.token as string | undefined) ??
            authorizationToken ??
            ''
          const wsIds = await getWorkspaceIds(ctx, token, req.path)
          if (wsIds === null) {
            res.status(403).send()
            return
          }

          const uuid = req.params.file ?? req.query.file
          if (uuid === undefined) {
            res.status(404).send()
            return
          }

          const blobInfo = await ctx.with('stat', {}, (ctx) => config.storageAdapter.stat(ctx, wsIds, uuid), {
            workspace: wsIds.uuid
          })

          if (blobInfo === undefined) {
            ctx.error('No such key', { file: uuid, workspace: wsIds.uuid })
            res.status(404).send()
            return
          }

          if (req.method === 'HEAD') {
            res.writeHead(200, {
              'accept-ranges': 'bytes',
              connection: 'keep-alive',
              'Keep-Alive': 'timeout=5',
              'content-type': blobInfo.contentType,
              'content-length': blobInfo.size,
              'content-security-policy': "default-src 'none';",
              Etag: blobInfo.etag,
              'Last-Modified': new Date(blobInfo.modifiedOn).toISOString()
            })
            res.status(200)

            res.end()
            return
          }

          const range = req.headers.range
          if (range !== undefined) {
            await ctx.with(
              'file-range',
              {},
              (ctx) => getFileRange(ctx, blobInfo, range, config.storageAdapter, wsIds, res),
              { workspace: wsIds.uuid }
            )
          } else {
            await ctx.with('file', {}, (ctx) => getFile(ctx, blobInfo, config.storageAdapter, wsIds, req, res), {
              uuid,
              workspace: wsIds.uuid
            })
          }
        } catch (error: any) {
          if (error instanceof PlatformError && error.status.code === platform.status.Unauthorized) {
            res.status(401).send()
            return
          }
          if (
            error?.code === 'NoSuchKey' ||
            error?.code === 'NotFound' ||
            error?.message === 'No such key' ||
            error?.Code === 'NoSuchKey'
          ) {
            ctx.error('No such storage key', {
              file: req.query.file
            })
            res.status(404).send()
            return
          } else {
            ctx.error('error-handle-files', { error })
          }
          res.status(500).send()
        }
      },
      { url: req.path, query: req.query }
    )
  }

  app.get('/files', (req, res) => {
    void filesHandler(req, res)
  })

  app.head('/files/*', (req, res) => {
    void filesHandler(req, res)
  })

  app.get('/files/*', (req, res) => {
    void filesHandler(req, res)
  })

  app.post('/files', (req, res) => {
    void handleUpload(req, res)
  })

  app.post('/files/*', (req, res) => {
    void handleUpload(req, res)
  })

  const handleUpload = async (req: Request, res: Response): Promise<void> => {
    await ctx.with(
      'post-file',
      {},
      async (ctx) => {
        const file = req.files?.file as UploadedFile

        if (file === undefined) {
          res.status(400).send()
          return
        }

        const authHeader = req.headers.authorization
        if (authHeader === undefined) {
          res.status(403).send()
          return
        }

        try {
          const token = authHeader.split(' ')[1]
          const workspaceDataId = await getWorkspaceIds(ctx, token, req.path)
          if (workspaceDataId === null) {
            res.status(403).send()
            return
          }
          const { uuid, etag } = await storageUpload(ctx, config.storageAdapter, workspaceDataId, file)

          res.status(200).send([
            {
              key: 'file',
              id: uuid,
              metadata: {
                name: uuid,
                etag,
                size: file.size,
                contentType: file.mimetype,
                lastModified: Date.now()
              }
            }
          ])
        } catch (error: any) {
          if (error instanceof PlatformError && error.status.code === platform.status.Unauthorized) {
            res.status(401).send()
            return
          }
          ctx.error('error-post-files', error)
          res.status(500).send()
        }
      },
      { url: req.path, query: req.query }
    )
  }

  const handleDelete = async (req: Request, res: Response): Promise<void> => {
    try {
      const authHeader = req.headers.authorization
      if (authHeader === undefined) {
        res.status(403).send()
        return
      }

      const token = authHeader.split(' ')[1]
      const workspaceDataId = await getWorkspaceIds(ctx, token, req.path)
      if (workspaceDataId === null) {
        res.status(403).send()
        return
      }
      const uuid = req.query.file as string
      if (uuid === '') {
        res.status(500).send()
        return
      }

      // TODO: We need to allow delete only of user attached documents. (https://front.hc.engineering/workbench/platform/tracker/TSK-1081)
      await config.storageAdapter.remove(ctx, workspaceDataId, [uuid])

      res.status(200).send()
    } catch (error: any) {
      if (error instanceof PlatformError && error.status.code === platform.status.Unauthorized) {
        res.status(401).send()
        return
      }
      Analytics.handleError(error)
      ctx.error('failed to delete', { url: req.url })
      res.status(500).send()
    }
  }

  const handleImportGet = async (req: Request, res: Response): Promise<void> => {
    try {
      const authHeader = req.headers.authorization
      if (authHeader === undefined) {
        res.status(403).send()
        return
      }
      const token = authHeader.split(' ')[1]
      const workspaceDataId = await getWorkspaceIds(ctx, token)
      if (workspaceDataId === null) {
        res.status(403).send()
        return
      }
      const url = req.query.url as string
      const cookie = req.query.cookie as string | undefined
      // const attachedTo = req.query.attachedTo as Ref<Doc> | undefined
      if (url === undefined) {
        res.status(500).send('URL param is not defined')
        return
      }

      console.log('importing from', url)
      console.log('cookie', cookie)

      const options =
        cookie !== undefined
          ? {
              headers: {
                Cookie: cookie
              }
            }
          : {}

      https
        .get(url, options, (response) => {
          if (response.statusCode !== 200) {
            // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
            res.status(500).send(`server returned ${response.statusCode}`)
            return
          }
          const id = uuid()
          const contentType = response.headers['content-type'] ?? 'application/octet-stream'
          const data: Uint8Array[] = []
          response
            .on('data', function (chunk) {
              data.push(chunk)
            })
            .on('end', function () {
              const buffer = Buffer.concat(data as unknown as Uint8Array[])
              config.storageAdapter
                .put(ctx, workspaceDataId, id, buffer, contentType, buffer.length)
                .then(async () => {
                  res.status(200).send({
                    id,
                    contentType,
                    size: buffer.length
                  })
                })
                .catch((err: any) => {
                  if (err !== null) {
                    Analytics.handleError(err)
                    ctx.error('error', { err })
                    res.status(500).send(err)
                  }
                })
            })
            .on('error', function (err) {
              Analytics.handleError(err)
              ctx.error('error', { err })
              res.status(500).send(err)
            })
        })
        .on('error', (e) => {
          Analytics.handleError(e)
          ctx.error('error', { e })
          res.status(500).send(e)
        })
    } catch (error: any) {
      if (error instanceof PlatformError && error.status.code === platform.status.Unauthorized) {
        res.status(401).send()
        return
      }
      Analytics.handleError(error)
      ctx.error('error', { error })
      res.status(500).send()
    }
  }

  const handleImportPost = async (req: Request, res: Response): Promise<void> => {
    try {
      const authHeader = req.headers.authorization
      if (authHeader === undefined) {
        res.status(403).send()
        return
      }
      const token = authHeader.split(' ')[1]
      const workspaceDataId = await getWorkspaceIds(ctx, token)
      if (workspaceDataId === null) {
        res.status(403).send()
        return
      }
      const { url, cookie } = req.body
      if (url === undefined) {
        res.status(500).send('URL param is not defined')
        return
      }

      console.log('importing from', url)
      console.log('cookie', cookie)

      const options =
        cookie !== undefined
          ? {
              headers: {
                Cookie: cookie
              }
            }
          : {}

      https.get(url, options, (response) => {
        console.log('status', response.statusCode)
        if (response.statusCode !== 200) {
          // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
          res.status(500).send(`server returned ${response.statusCode}`)
          return
        }
        const id = uuid()
        const contentType = response.headers['content-type']
        const data: Uint8Array[] = []
        response
          .on('data', function (chunk) {
            data.push(chunk)
          })
          .on('end', function () {
            const buffer = Buffer.concat(data as unknown as Uint8Array[])
            // eslint-disable-next-line @typescript-eslint/no-misused-promises
            config.storageAdapter
              .put(ctx, workspaceDataId, id, buffer, contentType ?? 'application/octet-stream', buffer.length)
              .then(async () => {
                res.status(200).send({
                  id,
                  contentType,
                  size: buffer.length
                })
              })
              .catch((err: any) => {
                Analytics.handleError(err)
                ctx.error('error', { err })
                res.status(500).send(err)
              })
          })
          .on('error', function (err) {
            Analytics.handleError(err)
            ctx.error('error', { err })
            res.status(500).send(err)
          })
      })
    } catch (error: any) {
      if (error instanceof PlatformError && error.status.code === platform.status.Unauthorized) {
        res.status(401).send()
        return
      }
      Analytics.handleError(error)
      ctx.error('error', { error })
      res.status(500).send()
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-misused-promises
  app.delete('/files', handleDelete)

  // eslint-disable-next-line @typescript-eslint/no-misused-promises
  app.delete('/files/*', handleDelete)

  // todo remove it after update all customers chrome extensions
  app.get('/import', (req, res) => {
    void handleImportGet(req, res)
  })

  app.post('/import', (req, res) => {
    void handleImportPost(req, res)
  })

  app.get('*', (request, response) => {
    // Simple path traversal check - reject if path contains ..
    if (request.path.includes('..')) {
      response.sendStatus(403)
      return
    }
    // If path has a file extension, it's likely a missing static file
    if (request.path.includes('.') && !request.path.endsWith('/')) {
      response.sendStatus(404)
      return
    }

    // SPA routing — serve cached index.html
    if (serveCachedIndex(request, response)) {
      return
    }

    // Fallback to sendFile if cache not available
    response.sendFile(join(dist, 'index.html'), {
      etag: true,
      lastModified: true,
      cacheControl: false,
      headers: {
        'Cache-Control': cacheControlNoCache,
        'Keep-Alive': 'timeout=5'
      }
    })
  })

  const server = app.listen(port)
  server.keepAliveTimeout = KEEP_ALIVE_TIMEOUT * 1000 + 1000
  server.headersTimeout = KEEP_ALIVE_TIMEOUT * 1000 + 2000

  return () => {
    server.close()
    // Clear file cache on shutdown
    fileCache.clear()
  }
}
