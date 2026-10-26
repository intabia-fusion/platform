import { getResource } from '@hcengineering/platform'
import { getClient } from '@hcengineering/presentation'
import ui, { showPopup } from '@hcengineering/ui'
import emojiPlugin from '@hcengineering/emoji'
import textEditor, { type RefAction } from '@hcengineering/text-editor'

export const defaultRefActions: RefAction[] = [
  {
    label: textEditor.string.Mention,
    icon: ui.icon.At,
    action: (_element, editorHandler) => {
      editorHandler.insertText('@')
      editorHandler.focus()
    },
    order: 3000
  },
  {
    label: textEditor.string.Emoji,
    icon: emojiPlugin.icon.Emoji,
    action: (element, editorHandler) => {
      showPopup(
        emojiPlugin.component.EmojiPopup,
        {},
        element,
        (emoji) => {
          if (emoji === null || emoji === undefined) {
            return
          }
          editorHandler.insertEmoji(emoji.text, emoji.image)
          editorHandler.focus()
        },
        () => {}
      )
    },
    order: 4001
  }
]

export async function getModelRefActions (): Promise<RefAction[]> {
  const client = getClient()

  const actions: RefAction[] = []

  const items = await client.findAll(textEditor.class.RefInputActionItem, {})
  for (const item of items) {
    actions.push({
      label: item.label,
      icon: item.icon,
      order: item.order ?? 10000,
      action: await getResource(item.action)
    })
  }

  return actions
}
