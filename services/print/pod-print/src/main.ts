//
// Copyright © 2024 Hardcore Engineering Inc.
//

import { setMetadata } from '@intabiafusion/platform'
import serverToken from '@intabiafusion/server-token'

import { storageConfigFromEnv } from '@intabiafusion/server-storage'
import config from './config'
import { createServer, listen } from './server'

const setupMetadata = (): void => {
  setMetadata(serverToken.metadata.Secret, config.Secret)
  setMetadata(serverToken.metadata.Service, 'print')
}

export const main = async (): Promise<void> => {
  setupMetadata()

  const storageConfig = storageConfigFromEnv()
  const { app, close } = createServer(storageConfig, config.AllowedHostnames)
  const server = listen(app, config.Port)

  const shutdown = (): void => {
    close()
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
