//
// Copyright © 2024 Hardcore Engineering Inc.
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

import OpenAI from 'openai'
import fs from 'fs'
import yaml from 'js-yaml'

import { SttProviderType } from './transcription/types'

interface Config {
  AccountsURL: string
  ServerSecret: string
  ServiceID: string
  FirstName: string
  LastName: string
  AvatarPath: string
  AvatarName: string
  AvatarContentType: string
  Password: string
  OpenAIKey: string
  OpenAIModel: OpenAI.ChatModel
  OpenAIBaseUrl: string
  OpenAITranslateModel: OpenAI.ChatModel
  OpenAISummaryModel: OpenAI.ChatModel

  // LLM selection (e.g. 'openai' | 'gigachat' or leave empty for auto)
  LLMProvider: string

  MaxContentTokens: number
  MaxHistoryRecords: number
  Port: number
  LoveEndpoint: string
  DataLabApiKey: string
  BillingUrl: string
  DeepgramPollIntervalMinutes: number
  DeepgramApiKey: string
  DeepgramProjectId: string
  DeepgramTag: string
  // STT Transcription settings
  SttProvider: SttProviderType
  SttUrl: string
  SttApiKey: string
  SttModel: string
  // VAD settings
  VadRmsThreshold: number
  VadSpeechRatioThreshold: number

  // GigaChat configuration
  GigaChatCredentials: string
  GigaChatScope: string
  GigaChatModel: string
  GigaChatBaseUrl: string
  GigaChatTimeout: string

  StorageConfig: string

  ChunkStorage: string // A blob temporal storage, for ogm and wav chunks.

  // If specified all chunks will be saved to this directory, per user at a time.wav + transcription
  DebugDir?: string
}

// Define the YAML configuration structure
interface YamlConfig {
  accounts: {
    url: string
    serverSecret: string
    serviceId?: string
  }
  bot: {
    firstName: string
    lastName: string
    password?: string
    avatar?: {
      path?: string
      name?: string
      contentType?: string
    }
  }
  port?: number
  llm: {
    provider?: string
    openai?: {
      apiKey?: string
      model?: string
      baseUrl?: string
      translateModel?: string
      summaryModel?: string
    }
    gigachat?: {
      credentials?: string
      scope?: string
      model?: string
      baseUrl?: string
      timeout?: string
    }
  }
  stt: {
    provider?: string
    url?: string
    apiKey?: string
    model?: string
  }
  deepgram?: {
    apiKey?: string
    projectId?: string
    tag?: string
    pollIntervalMinutes?: number
  }
  vad?: {
    rmsThreshold?: number
    speechRatioThreshold?: number
  }
  services: {
    love: {
      endpoint: string
    }
    billing: {
      url: string
    }
    datalab?: {
      apiKey?: string
    }
  }
  storage?: {
    config?: string
    chunks?: string
  }
  limits?: {
    maxContentTokens?: number
    maxHistoryRecords?: number
  }
  debug?: {
    dir?: string
  }
}

const parseNumber = (str: string | undefined): number | undefined => (str !== undefined ? Number(str) : undefined)

const config: Config = (() => {
  // Try to load configuration from YAML file first
  let yamlConfig: YamlConfig | null = null

  // Check if CONFIG_PATH environment variable is set
  const configPath = process.env.CONFIG_PATH
  if (configPath !== undefined && fs.existsSync(configPath)) {
    try {
      const configFileContent = fs.readFileSync(configPath, 'utf8')
      yamlConfig = yaml.load(configFileContent) as YamlConfig
    } catch (error) {
      console.warn(`Failed to load YAML config from ${configPath}:`, error)
    }
  }

  // Also check if CONFIG_YAML environment variable is set (with base64 encoded content)
  const configYaml = process.env.CONFIG_YAML
  if (configYaml !== undefined) {
    try {
      const decodedYaml = Buffer.from(configYaml, 'base64').toString('utf8')
      yamlConfig = yaml.load(decodedYaml) as YamlConfig
    } catch (error) {
      console.warn('Failed to load YAML config from CONFIG_YAML environment variable:', error)
    }
  }

  // Build the config object, prioritizing YAML config over environment variables
  const params: Partial<Config> = {
    // Accounts configuration
    AccountsURL: yamlConfig?.accounts?.url ?? process.env.ACCOUNTS_URL,
    ServerSecret: yamlConfig?.accounts?.serverSecret ?? process.env.SERVER_SECRET,
    ServiceID: yamlConfig?.accounts?.serviceId ?? process.env.SERVICE_ID ?? 'ai-bot-service',

    // Bot identity configuration
    FirstName: yamlConfig?.bot?.firstName ?? process.env.FIRST_NAME,
    LastName: yamlConfig?.bot?.lastName ?? process.env.LAST_NAME,
    Password: yamlConfig?.bot?.password ?? process.env.PASSWORD ?? 'password',
    AvatarPath: yamlConfig?.bot?.avatar?.path ?? process.env.AVATAR_PATH ?? './assets/avatar.png',
    AvatarName: yamlConfig?.bot?.avatar?.name ?? process.env.AVATAR_NAME ?? 'huly_ai_bot_avatar',
    AvatarContentType: yamlConfig?.bot?.avatar?.contentType ?? process.env.AVATAR_CONTENT_TYPE ?? 'image/png',

    // Port configuration
    Port: yamlConfig?.port ?? parseNumber(process.env.PORT) ?? 4010,

    // LLM configuration
    LLMProvider: yamlConfig?.llm?.provider ?? process.env.LLM_PROVIDER ?? '',
    OpenAIKey: yamlConfig?.llm?.openai?.apiKey ?? process.env.OPENAI_API_KEY ?? '',
    OpenAIModel: (yamlConfig?.llm?.openai?.model ?? process.env.OPENAI_MODEL ?? 'gpt-4o-mini') as OpenAI.ChatModel,
    OpenAIBaseUrl: yamlConfig?.llm?.openai?.baseUrl ?? process.env.OPENAI_BASE_URL ?? '',
    OpenAITranslateModel: (yamlConfig?.llm?.openai?.translateModel ??
      process.env.OPENAI_TRANSLATE_MODEL ??
      process.env.OPENAI_MODEL ??
      'gpt-4o-mini') as OpenAI.ChatModel,
    OpenAISummaryModel: (yamlConfig?.llm?.openai?.summaryModel ??
      process.env.OPENAI_SUMMARY_MODEL ??
      process.env.OPENAI_MODEL ??
      'gpt-4o-mini') as OpenAI.ChatModel,

    // GigaChat configuration
    GigaChatCredentials: yamlConfig?.llm?.gigachat?.credentials ?? process.env.GIGACHAT_CREDENTIALS ?? '',
    GigaChatScope: yamlConfig?.llm?.gigachat?.scope ?? process.env.GIGACHAT_SCOPE ?? 'GIGACHAT_API_PERS',
    GigaChatModel: yamlConfig?.llm?.gigachat?.model ?? process.env.GIGACHAT_MODEL ?? 'GigaChat',
    GigaChatBaseUrl:
      yamlConfig?.llm?.gigachat?.baseUrl ??
      process.env.GIGACHAT_BASE_URL ??
      'https://gigachat.devices.sberbank.ru/api/v1/',
    GigaChatTimeout: yamlConfig?.llm?.gigachat?.timeout ?? process.env.GIGACHAT_TIMEOUT ?? '600',

    // Limits
    MaxContentTokens: yamlConfig?.limits?.maxContentTokens ?? parseNumber(process.env.MAX_CONTENT_TOKENS) ?? 128 * 100,
    MaxHistoryRecords: yamlConfig?.limits?.maxHistoryRecords ?? parseNumber(process.env.MAX_HISTORY_RECORDS) ?? 500,

    // Service endpoints
    LoveEndpoint: yamlConfig?.services?.love?.endpoint ?? process.env.LOVE_ENDPOINT ?? '',
    DataLabApiKey: yamlConfig?.services?.datalab?.apiKey ?? process.env.DATALAB_API_KEY ?? '',
    BillingUrl: yamlConfig?.services?.billing?.url ?? process.env.BILLING_URL ?? '',

    // Deepgram configuration
    DeepgramPollIntervalMinutes:
      yamlConfig?.deepgram?.pollIntervalMinutes ?? parseNumber(process.env.DEEPGRAM_POLL_INTERVAL_MINUTES) ?? 60,
    DeepgramApiKey: yamlConfig?.deepgram?.apiKey ?? process.env.DEEPGRAM_API_KEY ?? '',
    DeepgramProjectId: yamlConfig?.deepgram?.projectId ?? process.env.DEEPGRAM_PROJECT_ID ?? '',
    DeepgramTag: yamlConfig?.deepgram?.tag ?? process.env.DEEPGRAM_TAG ?? '',

    // STT configuration
    SttProvider: (yamlConfig?.stt?.provider ?? process.env.STT_PROVIDER ?? 'wsr') as SttProviderType,
    SttUrl: yamlConfig?.stt?.url ?? process.env.STT_URL ?? '',
    SttApiKey: yamlConfig?.stt?.apiKey ?? process.env.STT_API_KEY ?? '',
    SttModel: yamlConfig?.stt?.model ?? process.env.STT_MODEL ?? '',

    // VAD configuration
    VadRmsThreshold: yamlConfig?.vad?.rmsThreshold ?? parseFloat(process.env.VAD_RMS_THRESHOLD ?? '0.02'),
    VadSpeechRatioThreshold:
      yamlConfig?.vad?.speechRatioThreshold ?? parseFloat(process.env.VAD_SPEECH_RATIO_THRESHOLD ?? '0.1'),

    // Storage configuration
    StorageConfig: yamlConfig?.storage?.config ?? process.env.STORAGE_CONFIG ?? undefined,

    // Chunk storage configuration
    ChunkStorage: yamlConfig?.storage?.chunks ?? process.env.CHUNK_STORAGE_CONFIG ?? undefined,

    // Debug configuration
    DebugDir: yamlConfig?.debug?.dir ?? process.env.DEBUG_DIR ?? ''
  }

  const missingEnv = (Object.keys(params) as Array<keyof Config>).filter((key) => params[key] === undefined)

  if (missingEnv.length > 0) {
    throw Error(
      `Missing config values: ${missingEnv.join(', ')}. Values can be provided via YAML config file or environment variables.`
    )
  }

  return params as Config
})()

export default config
