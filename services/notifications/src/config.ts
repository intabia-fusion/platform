//
// Copyright © 2026 Intabia Fusion Inc.
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

import { config as dotenvConfig } from 'dotenv'
import { NotificationProvider } from '@hcengineering/notification'
import { Ref } from '@hcengineering/core'

dotenvConfig()

export interface Config {
  AccountsUrl: string
  QueueConfig: string
  QueueRegion: string
  Secret: string
  ServiceId: string
  StorageConfig: string
  AllowedNotificationProviders: (Ref<NotificationProvider> | 'all')[]
  DbUrl: string
  ApplyTxBatchSize: number
  ApplyTxRetries: number
  FrontUrl: string
  BrandingPath: string
  LatestNotificationsSliceSize: number
  // The cap on holding a native push while its receiver is at the computer.
  PushHoldMs: number
  HoldLetters: boolean
}

function parseMs (name: string, fallback: string): number {
  const value = parseInt(process.env[name] ?? fallback)
  if (!Number.isFinite(value) || value < 0) throw Error(`Invalid env variable ${name}: ${process.env[name]}`)
  return value
}

function getAllowedProviders (): (Ref<NotificationProvider> | 'all')[] {
  return (process.env.NOTIFICATION_PROVIDERS ?? 'all')
    .split(',')
    .map((it) => it.trim())
    .filter((it) => it.length > 0) as (Ref<NotificationProvider> | 'all')[]
}

const config: Config = (() => {
  const params: Partial<Config> = {
    Secret: process.env.SECRET ?? 'secret',
    QueueConfig: process.env.QUEUE_CONFIG,
    QueueRegion: process.env.QUEUE_REGION,
    AccountsUrl: process.env.ACCOUNTS_URL,
    ServiceId: process.env.SERVICE_ID ?? 'notifications',
    StorageConfig: process.env.STORAGE_CONFIG,
    AllowedNotificationProviders: getAllowedProviders(),
    DbUrl: process.env.DB_URL,
    ApplyTxBatchSize: parseInt(process.env.APPLY_TX_BATCH_SIZE ?? '100'),
    FrontUrl: process.env.FRONT_URL,
    BrandingPath: process.env.BRANDING_PATH ?? '',
    LatestNotificationsSliceSize: parseInt(process.env.LATEST_NOTIFICATIONS_SLICE_SIZE ?? '5'),
    PushHoldMs: parseMs('PUSH_HOLD_MS', '60000'),
    HoldLetters: (process.env.HOLD_LETTERS ?? 'true') !== 'false'
  }

  const missingEnv = (Object.keys(params) as Array<keyof Config>).filter((key) => params[key] === undefined)

  if (missingEnv.length > 0) {
    throw Error(`Missing env variables: ${missingEnv.join(', ')}`)
  }

  return params as Config
})()

export default config
