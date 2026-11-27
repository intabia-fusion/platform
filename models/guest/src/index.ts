import { type Class, type IndexingConfiguration, type Doc, type Domain, type Ref } from '@hcengineering/core'
import { type PublicFileSyncJob, type PublicLink, type Restrictions } from '@hcengineering/guest'
import { type Builder, Model } from '@hcengineering/model'
import core, { TDoc } from '@hcengineering/model-core'
import { type Location } from '@hcengineering/ui/src/types'
import guest from './plugin'

export const GUEST_DOMAIN = 'guest' as Domain

@Model(guest.class.PublicLink, core.class.Doc, GUEST_DOMAIN)
export class TPublicLink extends TDoc implements PublicLink {
  url!: string
  location!: Location
  restrictions!: Restrictions
  revokable!: boolean
  attachedTo!: Ref<Doc>
  attachedToClass?: Ref<Class<Doc>>
}

@Model(guest.class.PublicFileSyncJob, core.class.Doc, 'public_file_sync' as Domain)
class TPublicFileSyncJob extends TDoc implements PublicFileSyncJob {
  generation!: string
  readyAt!: number
}

export function createModel (builder: Builder): void {
  builder.createModel(TPublicLink, TPublicFileSyncJob)

  builder.createDoc(core.class.DomainIndexConfiguration, core.space.Model, {
    domain: GUEST_DOMAIN,
    disabled: [
      { createdOn: -1 },
      { space: 1 },
      { modifiedBy: 1 },
      { createdBy: 1 },
      { attachedToClass: 1 },
      { createdOn: -1 }
    ]
  })
  builder.mixin<Class<PublicLink>, IndexingConfiguration<PublicLink>>(
    guest.class.PublicLink,
    core.class.Class,
    core.mixin.IndexConfiguration,
    {
      searchDisabled: true,
      indexes: []
    }
  )
}

export { guestId } from '@hcengineering/guest'
export * from './migration'
export * from './utils'
