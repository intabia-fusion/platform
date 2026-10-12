//
// Content reports: the client files a transient ContentReportAction, this trigger drops a moderation
// card into every workspace owner's direct message with the system. What the card says - reportCard.ts.
//

import activity, { type ActivityInfoMessage } from '@hcengineering/activity'
import chunter, { type ChatMessage, type ContentReportAction, type DirectMessage } from '@hcengineering/chunter'
import core, {
  AccountRole,
  type AccountUuid,
  type Collaborator,
  type Tx,
  type TxCreateDoc,
  TxFactory,
  type TxRemoveDoc,
  TxProcessor,
  systemAccountUuid
} from '@hcengineering/core'
import { getAccountClient } from '@hcengineering/server-client'
import { getAddCollaboratorsTxes } from '@hcengineering/server-contact'
import { type TriggerControl } from '@hcengineering/server-core'
import { generateToken } from '@hcengineering/server-token'

import { type Card, type WorkspaceMember, buildCard, getPersonInfo, messageSubject, personSubject } from './reportCard'

// The pipeline hands triggers a factory keyed by the reporter; the cards must come from the system.
const systemTxFactory = new TxFactory(core.account.System, true)

export async function OnContentReport (
  txes: TxCreateDoc<ContentReportAction>[],
  control: TriggerControl
): Promise<Tx[]> {
  const res: Tx[] = []
  for (const tx of txes) {
    const action = TxProcessor.createDoc2Doc(tx)
    res.push(...(await control.ctx.with('OnContentReport', {}, () => handleReport(action, control))))
  }
  return res
}

async function handleReport (action: ContentReportAction, control: TriggerControl): Promise<Tx[]> {
  const { ctx } = control
  // Temporary tracing while the flow is being verified on the stand.
  const reporter = await getPersonInfo(action.createdBy ?? action.modifiedBy, control)
  if (reporter == null) {
    ctx.warn('content report: reporter unknown, dropped', { by: action.modifiedBy })
    return []
  }
  const members = await workspaceMembers(control)

  const subject =
    action.account != null && action.account !== ''
      ? await personSubject(action.account, members, control)
      : await messageSubject(action, control)
  if (subject === undefined) {
    ctx.warn('content report: no subject, dropped', { messageId: action.messageId, account: action.account })
    return []
  }

  const owners = ownersToNotify(members, [reporter.account], subject.author?.account)
  if (owners.length === 0) {
    ctx.warn('content report: no owners to notify', { reporter: reporter.account, members: members.length })
    return []
  }

  const card = await buildCard(reporter, subject, action.reason, control)
  const txes = await deliver(card, owners, control)
  return txes
}

/** Everybody in the workspace with roles, from the account service (the session map holds only connected users). */
async function workspaceMembers (control: TriggerControl): Promise<WorkspaceMember[]> {
  try {
    const token = generateToken(systemAccountUuid, control.workspace.uuid, { service: 'transactor' })
    return await getAccountClient(token).getWorkspaceMembers()
  } catch (err: any) {
    control.ctx.warn('content report: cannot list workspace members', { error: err?.message ?? String(err) })
    return []
  }
}

/** Owners minus `except` and the system; the reported owner gets the card only when nobody else would. */
function ownersToNotify (
  members: WorkspaceMember[],
  except: AccountUuid[],
  reported: AccountUuid | undefined
): AccountUuid[] {
  const owners = members
    .filter((m) => m.role === AccountRole.Owner && !except.includes(m.person) && m.person !== systemAccountUuid)
    .map((m) => m.person)
  const others = owners.filter((it) => it !== reported)
  return others.length > 0 ? others : owners
}

async function deliver (card: Card, owners: AccountUuid[], control: TriggerControl): Promise<Tx[]> {
  const res: Tx[] = []
  const dms = await control.findAll(control.ctx, chunter.class.DirectMessage, { members: systemAccountUuid })
  const collaborators = await control.findAll(control.ctx, core.class.Collaborator, {
    attachedTo: { $in: dms.map((d) => d._id) }
  })
  for (const owner of owners) {
    let dm = dms.find((d) => d.members.length === 2 && d.members.includes(owner))?._id
    if (dm === undefined) {
      const create = systemTxFactory.createTxCreateDoc<DirectMessage>(chunter.class.DirectMessage, core.space.Space, {
        name: '',
        description: '',
        private: true,
        archived: false,
        members: [systemAccountUuid, owner],
        type: 'person'
      })
      res.push(create)
      dm = create.objectId
    }
    res.push(...collaboratorTxes(dm, [systemAccountUuid, owner], collaborators, control))
    res.push(
      systemTxFactory.createTxCreateDoc<ActivityInfoMessage>(activity.class.ActivityInfoMessage, dm, {
        attachedTo: dm,
        attachedToClass: chunter.class.DirectMessage,
        collection: 'activity',
        message: chunter.string.ContentReport,
        ...card
      })
    )
  }
  return res
}

// The collaborators trigger syncs only derived updates, never a derived create: a direct message the
// trigger opens would stay without collaborators, so it has no Chat entries and no notification receivers.
function collaboratorTxes (
  dm: DirectMessage['_id'],
  members: AccountUuid[],
  existing: Collaborator[],
  control: TriggerControl
): Tx[] {
  const missing = members.filter((m) => !existing.some((c) => c.attachedTo === dm && c.collaborator === m))
  return getAddCollaboratorsTxes(dm, chunter.class.DirectMessage, core.space.Space, control, missing)
}

export async function OnReportedMessageRemoved (
  txes: TxRemoveDoc<ChatMessage>[],
  control: TriggerControl
): Promise<Tx[]> {
  const removed = new Set<string>(txes.map((tx) => tx.objectId))
  const cards = await control.findAll(control.ctx, activity.class.ActivityInfoMessage, {
    message: chunter.string.ContentReport,
    'props.messageId': { $in: Array.from(removed) }
  })
  const res: Tx[] = []
  for (const card of cards) {
    const { messageId, ...props } = card.props ?? {}
    if (!removed.has(messageId)) continue
    res.push(systemTxFactory.createTxUpdateDoc(activity.class.ActivityInfoMessage, card.space, card._id, { props }))
  }
  return res
}
