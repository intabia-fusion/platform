// A task manager client and server using Clisr for communication.
//

import { type MeasureContext } from '@hcengineering/measurements'
import { ClisrServer } from './server'
import { ClisrClient } from './connection'
import express, { type Express } from 'express'

/**
 * An easy server -> client task scheduler using Clisr for communication.
 */
export async function createCallbackServer (
  ctx: MeasureContext,
  port: number,
  token: string,
  app: Express = express()
): Promise<ClisrServer> {
  const srv = new ClisrServer(
    ctx,
    async (_token) => {
      return token === _token
    },
    '1.0.0',
    app
  )

  await srv.start(ctx, port)
  return srv
}

export async function createCallbackClient (
  ctx: MeasureContext,
  url: string,
  token: string,
  executor: (task: string, args: any[]) => Promise<any>
): Promise<ClisrClient> {
  const client = new ClisrClient(
    ctx,
    url,
    (data) => {},
    () => token
  )
  client.callbackHandler = async (method, args, send) => {
    const result = await executor(method, args)
    await send(result)
  }
  return client
}
