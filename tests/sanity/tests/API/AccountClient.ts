import { getClient as getClientRaw, type AccountClient } from '@intabiafusion/account-client'
import { LocalUrl, PlatformAdmin } from '../utils'
import { systemAccountUuid } from '@intabiafusion/core'
import { generateToken } from '@intabiafusion/server-token'

let adminAccountClient: AccountClient

export async function getAdminAccountClient (): Promise<AccountClient> {
  if (adminAccountClient != null) {
    return adminAccountClient
  }

  const unauthClient = getClientRaw(LocalUrl)
  const loginInfo = await unauthClient.login(PlatformAdmin, '1234')

  if (loginInfo == null) {
    throw new Error('Failed to login as admin')
  }

  adminAccountClient = getClientRaw(LocalUrl, loginInfo.token)
  return adminAccountClient
}

export async function getServiceAccountClient (serviceName: string): Promise<AccountClient> {
  const token = generateToken(systemAccountUuid, undefined, { service: serviceName }, 'secret')
  return getClientRaw(LocalUrl, token)
}
