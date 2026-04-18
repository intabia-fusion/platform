import { type Doc, type Ref } from '@intabiafusion/core'
import { guestId } from '@intabiafusion/guest'
import guest from '@intabiafusion/guest-resources/src/plugin'
import { mergeIds } from '@intabiafusion/platform'
import { type AnyComponent } from '@intabiafusion/ui/src/types'
import { type Action, type ActionCategory } from '@intabiafusion/view'

export default mergeIds(guestId, guest, {
  action: {
    CreatePublicLink: '' as Ref<Action<Doc, any>>
  },
  category: {
    Guest: '' as Ref<ActionCategory>
  },
  component: {
    CreatePublicLink: '' as AnyComponent
  }
})
