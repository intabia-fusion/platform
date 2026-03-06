import core, { type AccountUuid, type Ref, TxOperations } from '@hcengineering/core'
import { withRetry } from '@hcengineering/retry'

import chunter, { DirectMessage } from '.'

export async function createDirect (
  client: TxOperations,
  _accounts: AccountUuid[]
): Promise<Ref<DirectMessage> | undefined> {
  return await withRetry(
    async (): Promise<Ref<DirectMessage> | undefined> => {
      const accounts = new Set(_accounts)
      if (accounts.size === 0) return undefined
      const direct = await findExistingDirect(client, accounts)

      if (direct != null) {
        const chat = await client.findOne(chunter.class.Chat, { attachedTo: direct })
        if (chat?.hidden === true) {
          await client.update(chat, { hidden: false })
        }
        return direct
      }

      return await client.createDoc(chunter.class.DirectMessage, core.space.Space, {
        name: '',
        description: '',
        private: true,
        archived: false,
        members: Array.from(accounts),
        type: accounts.size > 2 ? 'group' : 'person'
      })
    },
    { maxRetries: 3 }
  )
}

async function findExistingDirect (
  client: TxOperations,
  accounts: Set<AccountUuid>
): Promise<Ref<DirectMessage> | undefined> {
  if (accounts.size > 2) return undefined

  const existingDms = await client.findAll(chunter.class.DirectMessage, {})

  let direct: DirectMessage | undefined

  for (const dm of existingDms) {
    const dmAccounts = new Set(dm.members)

    if (dmAccounts.size !== accounts.size) continue

    let match = true

    for (const acc of dmAccounts) {
      if (!accounts.has(acc)) {
        match = false
        break
      }
    }

    if (match) {
      direct = dm
      break
    }
  }

  return direct?._id
}
