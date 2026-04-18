import { mergeIds } from '@intabiafusion/platform'
import { type AnyComponent } from '@intabiafusion/ui/src/types'
import emojiPlugin, { emojiId } from '@intabiafusion/emoji'

export default mergeIds(emojiId, emojiPlugin, {
  component: {
    WorkbenchExtension: '' as AnyComponent
  }
})
