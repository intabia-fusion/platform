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
import { readFileSync } from 'fs'
import yaml from 'js-yaml'

dotenvConfig()

export interface Config {
  AccountsUrl: string
  QueueConfig: string
  QueueRegion: string
  Secret: string
  ServiceId: string
  StorageConfig: string
  AllowedNotificationProviders: (Ref<NotificationProvider> | 'all')[]
  LastNameFirst: string
  DbUrl: string
  ApplyTxBatchSize: number
  FrontUrl: string
  TransactorEndpoints: string[]
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
    ServiceId: process.env.SERVICE_ID ?? 'notifications-service',
    StorageConfig: process.env.STORAGE_CONFIG,
    AllowedNotificationProviders: getAllowedProviders(),
    LastNameFirst: process.env.LAST_NAME_FIRST ?? 'false',
    DbUrl: process.env.DB_URL,
    ApplyTxBatchSize: parseInt(process.env.APPLY_TX_BATCH_SIZE ?? '100'),
    FrontUrl: process.env.FRONT_URL,
    TransactorEndpoints: getTransactorEndpoints()
  }

  const missingEnv = (Object.keys(params) as Array<keyof Config>).filter((key) => params[key] === undefined)

  if (missingEnv.length > 0) {
    throw Error(`Missing env variables: ${missingEnv.join(', ')}`)
  }

  return params as Config
})()

interface EndpointEntry {
  external: string
  internal: string
}

interface RegionEndpoints {
  name?: string
  transactors: EndpointEntry[]
  collaborators: EndpointEntry[]
}

interface RegionConfig {
  regions: Record<string, RegionEndpoints>
  workspaces?: Record<string, RegionEndpoints>
}

function loadRegionConfig (): RegionConfig {
  const configPath = process.env.REGION_CONFIG
  if (configPath !== undefined && configPath.length > 0) {
    const content = readFileSync(configPath, 'utf-8')
    const config = yaml.load(content)
    return validateRegionConfig(config, `REGION_CONFIG file '${configPath}'`)
  }

  const configJson = process.env.REGION_CONFIG_JSON
  if (configJson !== undefined && configJson.length > 0) {
    const config = JSON.parse(configJson)
    return validateRegionConfig(config, 'REGION_CONFIG_JSON env variable')
  }

  throw new Error('REGION_CONFIG or REGION_CONFIG_JSON must be set')
}

function validateRegionConfig (config: unknown, source: string): RegionConfig {
  if (config === null || typeof config !== 'object') {
    throw new Error(`Invalid region config from ${source}: expected an object`)
  }
  const obj = config as Record<string, unknown>
  if (obj.regions === undefined || typeof obj.regions !== 'object' || obj.regions === null) {
    throw new Error(`Invalid region config from ${source}: missing or invalid 'regions' field`)
  }
  return config as RegionConfig
}

function getTransactorEndpoints (): string[] {
  const endpoints = new Set<string>()

  try {
    const regionConfig = loadRegionConfig()

    for (const region of Object.values(regionConfig.regions)) {
      for (const t of region.transactors) {
        endpoints.add(t.internal.replace('ws://', 'http://').replace('wss://', 'https://'))
      }
    }
    if (regionConfig.workspaces != null) {
      for (const ws of Object.values(regionConfig.workspaces)) {
        for (const t of ws.transactors) {
          endpoints.add(t.internal.replace('ws://', 'http://').replace('wss://', 'https://'))
        }
      }
    }
  } catch (e) {
    console.error('Failed to load or parse REGION_CONFIG', e)
  }

  if (endpoints.size === 0) {
    throw new Error('No transactor endpoints found in REGION_CONFIG')
  }

  console.log('Transactor endpoints: ', endpoints)
  return Array.from(endpoints)
}

export default config
