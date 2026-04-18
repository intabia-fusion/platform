//
// Copyright © 2023 Hardcore Engineering Inc.
//
//

import client, { ClientSocket } from '@intabiafusion/client'
import clientResources from '@intabiafusion/client-resources'
import { Client, ClientConnectEvent, systemAccountUuid, WorkspaceUuid, type MeasureContext } from '@intabiafusion/core'
import { setMetadata } from '@intabiafusion/platform'
import { getTransactorEndpoint } from '@intabiafusion/server-client'
import { generateToken } from '@intabiafusion/server-token'
import WebSocket from 'ws'
import config from './config'

/**
 * @public
 */
export async function createPlatformClient (
  ctx: MeasureContext,
  workspace: WorkspaceUuid,
  timeout: number,
  reconnect?: (event: ClientConnectEvent, data: any) => Promise<void>
): Promise<{ client: Client, endpoint: string }> {
  setMetadata(client.metadata.ClientSocketFactory, (url) => {
    return new WebSocket(url, {
      headers: {
        'User-Agent': config.ServiceID
      }
    }) as never as ClientSocket
  })

  const token = generateToken(systemAccountUuid, workspace, { service: 'github', mode: 'github' })
  setMetadata(client.metadata.UseBinaryProtocol, true)
  setMetadata(client.metadata.UseProtocolCompression, true)
  setMetadata(client.metadata.ConnectionTimeout, timeout)
  setMetadata(client.metadata.FilterModel, 'client')
  const endpoint = await getTransactorEndpoint(token)
  const connection = await (
    await clientResources()
  ).function.GetClient(token, endpoint, {
    ctx,
    onConnect: reconnect,
    useGlobalRPCHandler: true
  })

  return { client: connection, endpoint }
}
