//
// Copyright © 2025 Hardcore Engineering Inc.
//
// Licensed under the Eclipse Public License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License. You may
// obtain a copy of the License at https://www.eclipse.org/legal/epl-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.
//

import { getClient } from '@hcengineering/account-client'
import core, {
  AccountRole,
  type AccountUuid,
  type Class,
  type Doc,
  generateId,
  MeasureContext,
  PersonId,
  type Ref,
  systemAccountUuid,
  type TxOperations,
  WorkspaceIds,
  WorkspaceUuid
} from '@hcengineering/core'
import exportPlugin from '@hcengineering/export'
import { generateToken } from '@hcengineering/server-token'
import notification, { NotificationProvider, NotificationType, TxNotificationType } from '@hcengineering/notification'
import contact from '@hcengineering/contact'

import envConfig from './config'

export async function sendExportCompletionNotification (
  ctx: MeasureContext,
  account: AccountUuid,
  targetTxOps: TxOperations,
  targetWorkspace: WorkspaceUuid,
  targetWsIds: WorkspaceIds,
  exportedDocuments: Array<{ docId: Ref<Doc>, name: string }>,
  sourceWsIds: WorkspaceIds,
  objectClass: Ref<Class<Doc>>
): Promise<void> {
  try {
    const count = exportedDocuments.length
    const resultId = generateId<Doc>()

    await targetTxOps.createDoc(
      exportPlugin.class.ExportResultRecord,
      core.space.Space,
      {
        sourceWorkspace: sourceWsIds.url,
        targetWorkspace: targetWsIds.url,
        exportedCount: count,
        exportedDocumentIds: exportedDocuments.map((d) => d.docId),
        objectClass
      },
      resultId
    )
    const type = await targetTxOps.findOne(notification.class.TxNotificationType, {
      _id: exportPlugin.ids.ImportedDocumentsNotification
    })
    if (type == null) return

    const targetWsToken = generateToken(systemAccountUuid, targetWorkspace, { service: 'export' })
    const targetAccountClient = getClient(envConfig.AccountsUrl, targetWsToken)
    const members = await targetAccountClient.getWorkspaceMembers()
    const owners = members.filter((m: { role: string }) => m.role === AccountRole.Owner) as Array<{
      person: AccountUuid
    }>

    if (owners.length === 0) {
      ctx.warn('No workspace owners found for export notification', { targetWorkspace })
      return
    }
    const sender = await targetTxOps.findOne(contact.class.Person, { personUuid: account })
    const senderSocialIds = ((await targetAccountClient.getPersonInfo(account))?.socialIds ?? []).map((it) => it._id)
    const spaces = await targetTxOps.findAll(contact.class.PersonSpace, {
      account: { $in: owners.map((it) => it.person) }
    })
    const providers: NotificationProvider[] = await targetTxOps
      .getModel()
      .findAll(notification.class.NotificationProvider, {})
    for (const owner of owners) {
      try {
        const space = spaces.find((it) => it.account === owner.person)
        if (space == null) continue

        const socialIds = ((await targetAccountClient.getPersonInfo(owner.person))?.socialIds ?? []).map((it) => it._id)
        if (socialIds.length === 0) continue

        const allowedProviders = await getAllowedProviders(targetTxOps, providers, type, socialIds)
        if (!allowedProviders.includes(notification.providers.InboxNotificationProvider)) continue

        const context = await targetTxOps.findOne(notification.class.DocNotifyContext, {
          objectId: resultId,
          user: owner.person
        })
        const docNotifyContextId =
          context?._id ??
          (await targetTxOps.createDoc(notification.class.DocNotifyContext, space._id, {
            objectId: resultId,
            objectClass: exportPlugin.class.ExportResultRecord,
            objectSpace: core.space.Space,
            user: owner.person
          }))

        await targetTxOps.createDoc(
          notification.class.CommonInboxNotification,
          space._id,
          {
            user: owner.person,
            objectId: resultId,
            objectClass: exportPlugin.class.ExportResultRecord,
            icon: exportPlugin.icon.Export,
            header: exportPlugin.string.ImportCompleted,
            message: exportPlugin.string.ImportToWorkspaceNotificationMessage,
            props: {
              senderName: sender?.name ?? 'System',
              count,
              sourceWorkspace: sourceWsIds.uuid
            },
            isViewed: false,
            archived: false,
            docNotifyContext: docNotifyContextId,
            allowedProviders: Object.fromEntries(allowedProviders.map((provider) => [provider, [type._id]]))
          },
          undefined,
          undefined,
          senderSocialIds[0]
        )
      } catch (err) {
        ctx.error('Failed to create export notification for owner', { owner: owner.person, err })
      }
    }
  } catch (err) {
    ctx.error('Failed to send export completion notification', { err })
  }
}

async function getAllowedProviders (
  client: TxOperations,
  providers: NotificationProvider[],
  type: TxNotificationType,
  socialIds: PersonId[]
): Promise<Ref<NotificationProvider>[]> {
  const result: Ref<NotificationProvider>[] = []

  for (const provider of providers) {
    const allowed = await isProviderAllowed(client, provider, type, socialIds)

    if (allowed) {
      result.push(provider._id)
    }
  }

  return result
}

async function isProviderAllowed (
  client: TxOperations,
  provider: NotificationProvider,
  type: NotificationType,
  socialIds: PersonId[]
): Promise<boolean> {
  const providerSettings = await client.findAll(notification.class.NotificationProviderSetting, {
    attachedTo: provider._id,
    createdBy: { $in: socialIds }
  })

  if (providerSettings.length > 0 && providerSettings.every((s) => !s.enabled)) {
    return false
  }

  if (providerSettings.length === 0 && !provider.defaultEnabled) {
    return false
  }

  const providerDefaults = client.getModel().findAllSync(notification.class.NotificationProviderDefaults, {})

  if (providerDefaults.some((it) => it.provider === provider._id && it.ignoredTypes.includes(type._id))) {
    return false
  }

  const typeSetting = await client.findOne(notification.class.NotificationTypeSetting, {
    attachedTo: provider._id,
    type: type._id,
    createdBy: { $in: socialIds }
  })

  if (typeSetting !== undefined) {
    return typeSetting.enabled
  }

  if (providerDefaults.some((it) => it.provider === provider._id && it.enabledTypes.includes(type._id))) {
    return true
  }

  return type.defaultEnabled
}
