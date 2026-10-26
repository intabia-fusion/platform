//
// Copyright © 2025 Hardcore Engineering Inc.
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
import { config as dotenv } from 'dotenv'

dotenv()

export interface CacheConfig {
  enabled: boolean
  cachePath: string | undefined // if set, enables disk cache
  cacheSize: number | undefined // maximum size of the cache in megabytes
  gcInterval: number | undefined // interval in seconds to run garbage collection
}

export interface VideoConfig {
  concurrency: number // video copies and ffmpeg runs at once, apart from the shared slots
  timeout: number // milliseconds, one ffmpeg run
  headTailSize: number // bytes, read from the start and from the end of a video
}

export interface Config {
  Port: number
  Secret: string
  ServiceID: string
  /** Account service, asked for workspace membership of an account cookie. */
  AccountsUrl: string
  /** Milliseconds a positive membership answer is cached. */
  AuthAllowCacheMs: number
  /** Milliseconds a negative answer is cached: a member added a moment ago must not wait long. */
  AuthDenyCacheMs: number
  Cache: CacheConfig
  MaxBlobSize: number // bytes, larger blobs get no preview
  Video: VideoConfig
  LibreOfficeTimeout: number // milliseconds, one conversion of a document
  PdfTimeout: number // milliseconds, one pdftocairo run
}

// setTimeout turns a delay above this into 1 ms
const MAX_TIMEOUT = 2147483647

// seconds in the environment, like CACHE_GC_INTERVAL, milliseconds out
function timeoutFromEnv (name: string, fallback: string): number {
  const timeout = parseInt(process.env[name] ?? fallback) * 1000
  if (!(timeout > 0 && timeout <= MAX_TIMEOUT)) {
    throw Error(`${name} must be a positive number of seconds, at most ${Math.floor(MAX_TIMEOUT / 1000)}`)
  }
  return timeout
}

const config: Config = (() => {
  // megabytes, like CACHE_SIZE
  const maxBlobSize = parseInt(process.env.MAX_BLOB_SIZE ?? '1024') * 1024 * 1024
  if (!(maxBlobSize > 0)) {
    throw Error('MAX_BLOB_SIZE must be a positive number of megabytes')
  }

  const ffmpegTimeout = timeoutFromEnv('FFMPEG_TIMEOUT', '60')
  const libreOfficeTimeout = timeoutFromEnv('LIBREOFFICE_TIMEOUT', '120')
  const pdfTimeout = timeoutFromEnv('PDF_TIMEOUT', '60')

  const videoConcurrency = parseInt(process.env.VIDEO_CONCURRENCY ?? '2')
  if (!(videoConcurrency > 0)) {
    throw Error('VIDEO_CONCURRENCY must be a positive number')
  }

  // megabytes, like MAX_BLOB_SIZE
  const headTailSize = parseInt(process.env.VIDEO_HEAD_TAIL_SIZE ?? '5') * 1024 * 1024
  if (!(headTailSize > 0)) {
    throw Error('VIDEO_HEAD_TAIL_SIZE must be a positive number of megabytes')
  }

  const params: Partial<Config> = {
    Port: parseInt(process.env.PORT ?? '4040'),
    Secret: process.env.SECRET,
    ServiceID: process.env.SERVICE_ID ?? 'preview',
    AccountsUrl: process.env.ACCOUNTS_URL,
    AuthAllowCacheMs: timeoutFromEnv('AUTH_ALLOW_CACHE_MS', '60'),
    AuthDenyCacheMs: timeoutFromEnv('AUTH_DENY_CACHE_MS', '30'),
    Cache: {
      enabled: process.env.CACHE_ENABLED !== 'false',
      cachePath: process.env.CACHE_PATH,
      cacheSize: parseInt(process.env.CACHE_SIZE ?? '1024') * 1024 * 1024,
      gcInterval: parseInt(process.env.CACHE_GC_INTERVAL ?? '300') * 1000
    },
    MaxBlobSize: maxBlobSize,
    Video: { concurrency: videoConcurrency, timeout: ffmpegTimeout, headTailSize },
    LibreOfficeTimeout: libreOfficeTimeout,
    PdfTimeout: pdfTimeout
  }

  const missingEnv = (Object.keys(params) as Array<keyof Config>).filter((key) => params[key] === undefined)

  if (missingEnv.length > 0) {
    throw Error(`Missing config for attributes: ${missingEnv.join(', ')}`)
  }

  return params as Config
})()

export default config
