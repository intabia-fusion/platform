//
// Copyright © 2024 Hardcore Engineering Inc.
// Copyright © 2026 Intabia Fusion.
//

import core, { type Doc, type Hierarchy, type Ref, type Space, type TxOperations } from '@hcengineering/core'
import { type Location } from '@hcengineering/ui'

import guest from './index'

export async function createPublicLink (
  client: TxOperations,
  object: Doc,
  location: Location,
  revokable: boolean = true
): Promise<void> {
  await client.createDoc(guest.class.PublicLink, getPublicLinkSpace(client.getHierarchy(), object), {
    attachedTo: object._id,
    attachedToClass: object._class,
    location,
    revokable,
    restrictions: {
      readonly: true,
      disableNavigation: true,
      disableActions: true,
      disableComments: true
    },
    url: ''
  })
}

// The token in PublicLink.url is read by whoever reads the link's space: the document's own.
export function getPublicLinkSpace (hierarchy: Hierarchy, doc: Doc): Ref<Space> {
  return hierarchy.isDerived(doc._class, core.class.Space) ? (doc._id as Ref<Space>) : doc.space
}
