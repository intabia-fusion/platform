import {
  DOMAIN_BLOB,
  DOMAIN_MODEL,
  DOMAIN_TRANSIENT,
  DOMAIN_TX,
  type Class,
  type Doc,
  type Hierarchy,
  type Ref
} from '@hcengineering/core'
import { getPublicLinkSpace, guestId, type PublicLink } from '@hcengineering/guest'
import {
  tryMigrate,
  type MigrateOperation,
  type MigrateUpdate,
  type MigrationClient,
  type MigrationUpgradeClient
} from '@hcengineering/model'
import { GUEST_DOMAIN } from './index'
import guest from './plugin'

// The class (or mixin) in the panel address of a link: component|id|class|tab, URI-encoded.
function addressedClass (hierarchy: Hierarchy, link: PublicLink): Ref<Class<Doc>> | undefined {
  try {
    const _class = decodeURIComponent(link.location?.fragment ?? '').split('|')[2] as Ref<Class<Doc>> | undefined
    return _class !== undefined && hierarchy.hasClass(_class) ? _class : undefined
  } catch {
    return undefined
  }
}

// GitHub keeps a DocSyncInfo under the id of its task, so an id can sit in two domains.
// The address tells which one the link shares; a document it does not confirm is not taken.
function pickDocument (hierarchy: Hierarchy, link: PublicLink, found: Doc[]): Doc | undefined {
  const named = addressedClass(hierarchy, link)
  const confirmed = named === undefined ? found : found.filter((it) => hierarchy.isDerived(named, it._class))
  return confirmed.length === 1 ? confirmed[0] : undefined
}

// Links made before attachedToClass sit in core.space.Workspace: every member read their url.
// The document is found by id, since location.fragment may hold the id of a link provider.
async function filePublicLinks (client: MigrationClient): Promise<void> {
  const links = (await client.find<PublicLink>(GUEST_DOMAIN, { _class: guest.class.PublicLink })).filter(
    (it) => it.attachedToClass == null
  )
  if (links.length === 0) return

  const found = new Map<Ref<Doc>, Doc[]>()
  const ids = Array.from(new Set(links.map((it) => it.attachedTo)))
  for (const domain of client.hierarchy.domains()) {
    if ([DOMAIN_TX, DOMAIN_MODEL, DOMAIN_TRANSIENT, DOMAIN_BLOB].includes(domain)) continue
    const docs = await client.find<Doc>(domain, { _id: { $in: ids } }, { projection: { _id: 1, _class: 1, space: 1 } })
    for (const doc of docs) found.set(doc._id, [...(found.get(doc._id) ?? []), doc])
  }

  const moved: Array<{ filter: { _id: Ref<PublicLink> }, update: MigrateUpdate<PublicLink> }> = []
  const gone: Array<Ref<PublicLink>> = []
  for (const link of links) {
    const doc = pickDocument(client.hierarchy, link, found.get(link.attachedTo) ?? [])
    if (doc === undefined || !client.hierarchy.hasClass(doc._class)) {
      gone.push(link._id)
    } else {
      moved.push({
        filter: { _id: link._id },
        update: { attachedToClass: doc._class, space: getPublicLinkSpace(client.hierarchy, doc) }
      })
    }
  }
  client.logger.log('filing public links', { moved: moved.length, deleted: gone.length })
  if (moved.length > 0) await client.bulk(GUEST_DOMAIN, moved)
  if (gone.length > 0) await client.deleteMany(GUEST_DOMAIN, { _id: { $in: gone } })
}

export const guestOperation: MigrateOperation = {
  async migrate (client: MigrationClient, mode): Promise<void> {
    await tryMigrate(mode, client, guestId, [
      {
        state: 'file-public-links-v1',
        mode: 'upgrade',
        func: filePublicLinks
      }
    ])
  },
  async upgrade (state: Map<string, Set<string>>, client: () => Promise<MigrationUpgradeClient>): Promise<void> {}
}
