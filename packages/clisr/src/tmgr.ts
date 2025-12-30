// A task manager client and server using Clisr for communication.
//

import { type MeasureContext } from '@hcengineering/measurements'
import { ClisrServer } from './server'
import { ClisrClient } from './connection'

/**
 * An easy server -> client task scheduler using Clisr for communication.
 */
export class TMGRServer {
  srv: ClisrServer
  constructor (
    readonly ctx: MeasureContext,
    port: number,
    token: string
  ) {
    this.srv = new ClisrServer(
      ctx,
      async (_token) => {
        return token === _token
      },
      '1.0.0'
    )

    void this.srv.start(ctx, port).catch((err) => {
      ctx.logger.error(`TaskManagerServer failed to start: ${err.message}`)
    })
  }

  async execute (task: string, args: any[]): Promise<any> {
    return await this.srv.request(this.ctx, task, args)
  }
}

export class TMGRClient {
  client: ClisrClient

  constructor (
    readonly ctx: MeasureContext,
    readonly url: string,
    readonly token: string,
    readonly executor: (task: string, args: any[]) => Promise<any>
  ) {
    this.client = new ClisrClient(
      ctx,
      url,
      (data) => {},
      () => this.token
    )
    this.client.callbackHandler = async (method, args, send) => {
      const result = await this.executor(method, args)
      await send(result)
    }
  }
}
