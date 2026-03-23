import contact, { type Person, type RecentlyUsedPersonsPreference } from '@hcengineering/contact'
import core, { getCurrentAccount, type Ref } from '@hcengineering/core'
import { getClient } from '@hcengineering/presentation'

export async function getRecentlyUsedAssignees (): Promise<Array<Ref<Person>>> {
  const me = getCurrentAccount()
  const client = getClient()
  const preference = await client.findOne<RecentlyUsedPersonsPreference>(contact.class.RecentlyUsedPersonsPreference, {
    attachedTo: me.uuid
  })
  return preference?.assignees ?? []
}

export async function addRecentlyUsedAssignee (personId: Ref<Person>): Promise<void> {
  const me = getCurrentAccount()
  const client = getClient()
  const op = client.apply()

  const preference = await client.findOne<RecentlyUsedPersonsPreference>(contact.class.RecentlyUsedPersonsPreference, {
    attachedTo: me.uuid
  })

  if (preference === undefined) {
    await op.createDoc(contact.class.RecentlyUsedPersonsPreference, core.space.Workspace, {
      attachedTo: me.uuid,
      assignees: [personId]
    })
  } else {
    const assignees = preference.assignees ?? []

    if (assignees.includes(personId)) {
      await op.update(preference, { $pull: { assignees: personId } })
    } else if (assignees.length >= 10) {
      const toRemove = assignees.slice(9)
      for (const id of toRemove) {
        await op.update(preference, { $pull: { assignees: id } })
      }
    }

    await op.update(preference, {
      $push: {
        assignees: {
          $each: [personId],
          $position: 0
        }
      }
    })
  }

  await op.commit()
}
