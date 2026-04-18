//
// Copyright © 2024 Hardcore Engineering Inc.
//
//

import { getClient as getAccountClient } from '@intabiafusion/account-client'
import { CollaboratorClient, getClient as getCollaboratorClient } from '@intabiafusion/collaborator-client'
import { systemAccountUuid, WorkspaceUuid } from '@intabiafusion/core'
import { generateToken } from '@intabiafusion/server-token'
import config from './config'

/**
 * @public
 */
export async function createCollaboratorClient (workspaceId: WorkspaceUuid): Promise<CollaboratorClient> {
  const token = generateToken(systemAccountUuid, workspaceId, { service: 'processor', mode: 'processor' })
  const accountClient = getAccountClient(config.AccountsUrl, token)

  const wsInfo = await accountClient.getLoginInfoByToken()
  if (wsInfo == null || !('collaboratorEndpoint' in wsInfo) || wsInfo.collaboratorEndpoint === undefined) {
    throw new Error('Invalid login info: collaboratorEndpoint not found')
  }

  return getCollaboratorClient(workspaceId, token, wsInfo.collaboratorEndpoint)
}
