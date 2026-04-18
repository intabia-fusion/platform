//
// Copyright © 2024 Hardcore Engineering Inc.
//

import { setMetadata } from '@intabiafusion/platform'
import serverClient from '@intabiafusion/server-client'
import { loadBrandingMap } from '@intabiafusion/server-core'
import { storageConfigFromEnv } from '@intabiafusion/server-storage'
import serverToken from '@intabiafusion/server-token'

import config from './config'
import { createServer, listen } from './server'

const setupMetadata = (): void => {
  setMetadata(serverToken.metadata.Secret, config.Secret)
  setMetadata(serverToken.metadata.Service, 'sign')
  setMetadata(serverClient.metadata.Endpoint, config.AccountsUrl)
  setMetadata(serverClient.metadata.UserAgent, config.ServiceID)
}

export const main = async (): Promise<void> => {
  setupMetadata()
  const storageConfig = storageConfigFromEnv()
  const server = listen(createServer(storageConfig, loadBrandingMap(config.BrandingPath)), config.Port)

  const shutdown = (): void => {
    server.close(() => process.exit())
  }

  process.on('SIGINT', shutdown)
  process.on('SIGTERM', shutdown)
  process.on('uncaughtException', (e) => {
    console.error(e)
  })
  process.on('unhandledRejection', (e) => {
    console.error(e)
  })
}
