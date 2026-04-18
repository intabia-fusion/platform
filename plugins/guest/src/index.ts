import { Class, Doc, PersonUuid, Ref } from '@intabiafusion/core'
import type { Asset, Plugin } from '@intabiafusion/platform'
import { plugin } from '@intabiafusion/platform'
import { AnyComponent, Location } from '@intabiafusion/ui'

export * from './utils'

export interface PublicLink extends Doc {
  attachedTo: Ref<Doc>
  url: string
  location: Location
  restrictions: Restrictions
  revokable: boolean
}

export interface Restrictions {
  readonly: boolean
  disableComments: boolean
  disableNavigation: boolean
  disableActions: boolean
}

export const guestAccount = 'b6996120-416f-49cd-841e-e4a5d2e49c9b' as PersonUuid

export const guestId = 'guest' as Plugin
export default plugin(guestId, {
  class: {
    PublicLink: '' as Ref<Class<PublicLink>>
  },
  icon: {
    Link: '' as Asset
  },
  component: {
    GuestApp: '' as AnyComponent
  }
})
