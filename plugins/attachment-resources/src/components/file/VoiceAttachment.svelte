<!--
// Copyright © 2026 Intabia Fusion.
//
// Licensed under the Eclipse Public License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License. You may
// obtain a copy of the License at https://www.eclipse.org/legal/epl-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
//
// See the License for the specific language governing permissions and
// limitations under the License.
-->
<script lang="ts">
  import attachment, { type Attachment } from '@hcengineering/attachment'
  import { getCurrentAccount, type Markup, type WithLookup } from '@hcengineering/core'
  import { setPlatformStatus, translate, unknownError } from '@hcengineering/platform'
  import presentation, { createQuery, getClient, getFileUrl, MessageViewer } from '@hcengineering/presentation'
  import { EmptyMarkup, jsonToMarkup, markupToJSON } from '@hcengineering/text'
  import { StyledTextEditor } from '@hcengineering/text-editor-resources'
  import { markdownToMarkup, markupToMarkdown } from '@hcengineering/text-markdown'
  import { IconCheck, IconClose, IconEdit, Label, Spinner, themeStore } from '@hcengineering/ui'
  import { AudioBar, IconButton } from '@hcengineering/ui/kit'

  import attachmentRes from '../../plugin'
  import { showAttachmentMenu } from './menu'

  type VoiceAttachment = WithLookup<Attachment> & {
    state?: 'pending' | 'done' | 'failed'
    text?: string
    edited?: boolean
    durationSec?: number
  }

  export let value: VoiceAttachment
  export let isSaved: boolean = false
  export let removable: boolean = false
  export let withActions: boolean = true

  const client = getClient()
  const me = getCurrentAccount()
  let editing = false
  let editMarkup: Markup = EmptyMarkup

  // The value comes from the message as it was sent; the transcript arrives later on the document.
  const liveQuery = createQuery()
  let live: VoiceAttachment = value
  $: if (live._id !== value._id) live = value
  // Watched only until the transcript settles: a chat holds many voice notes, each would keep a query.
  $: settled = live.state === 'done' || live.state === 'failed'
  $: watch(value._id, settled)

  function watch (_id: VoiceAttachment['_id'], done: boolean): void {
    if (done) {
      liveQuery.unsubscribe()
      return
    }
    liveQuery.query(attachment.class.Attachment, { _id }, (res) => {
      if (res[0] != null) live = res[0]
    })
  }

  $: src = getFileUrl(value.file, value.name)
  $: state = live.state
  $: text = (live.text ?? '').trim()
  $: markup = text !== '' ? jsonToMarkup(markdownToMarkup(text, { refUrl: 'ref://', imageUrl: '' })) : EmptyMarkup
  $: canEdit = withActions && state === 'done' && me.socialIds.includes(live.createdBy ?? live.modifiedBy)

  function startEdit (): void {
    editMarkup = markup
    placed = false
    editing = true
  }

  // Through the editor both ways, so a transcript opened and saved untouched compares equal.
  function toMarkdown (value: Markup): string {
    return markupToMarkdown(markupToJSON(value)).trim()
  }

  let editor: StyledTextEditor | undefined
  let placed = false

  // Opened to fix a word, usually after reading to the end: the caret starts there, not before the first word.
  function toEnd (): void {
    const tiptap = editor?.getEditor()
    if (placed || tiptap == null) return
    placed = true
    tiptap.commands.focus('end')
  }

  function cancelEdit (): void {
    editing = false
  }

  // Enter saves and Escape cancels, as in the message input; Shift+Enter keeps a new line.
  function onEditKey (e: KeyboardEvent): void {
    // Safari ends a composition with an Enter that is no longer composing.
    if (e.isComposing || e.keyCode === 229) return
    if (e.key === 'Escape' || (e.key === 'Enter' && !e.shiftKey)) {
      e.preventDefault()
      e.stopPropagation()
      if (e.key === 'Escape') cancelEdit()
      else void saveEdit()
    }
  }

  // The editor stays open until the text is stored: a failed save keeps what was typed.
  async function saveEdit (): Promise<void> {
    const md = toMarkdown(editMarkup)
    if (md === toMarkdown(markup)) {
      editing = false
      return
    }
    try {
      await client.updateDoc(live._class, live.space, live._id, { text: md, edited: true })
      live = { ...live, text: md, edited: true }
      editing = false
    } catch (err: any) {
      await setPlatformStatus(unknownError(err))
    }
  }

  let groupLabel = ''
  $: void translate(attachmentRes.string.VoiceMessage, {}, $themeStore.language).then((res) => (groupLabel = res))
</script>

<div
  class="voice-attachment"
  role="group"
  aria-label={groupLabel}
  on:contextmenu={(e) => {
    if (!withActions) return
    showAttachmentMenu(e, value, {
      isSaved,
      removable,
      extra:
        canEdit && !editing
          ? [
              {
                label: presentation.string.Edit,
                icon: IconEdit,
                action: async () => {
                  startEdit()
                }
              }
            ]
          : []
    })
  }}
>
  <div class="bar"><AudioBar id={value.file} {src} size={value.size} duration={value.durationSec} /></div>

  {#if state === 'pending'}
    <div class="status"><Spinner size="x-small" /> <Label label={attachment.string.Transcribing} /></div>
  {:else if editing}
    <div class="field">
      <!-- The keys of the editor only: Enter on a button presses that button. -->
      <!-- svelte-ignore a11y-no-static-element-interactions -->
      <div class="editor" on:keydown|capture={onEditKey}>
        <StyledTextEditor
          bind:this={editor}
          bind:content={editMarkup}
          showButtons={false}
          isScrollable={false}
          autofocus
          on:focus={toEnd}
        />
      </div>
      <div class="actions">
        <IconButton
          icon={IconClose}
          kind="ghost"
          size="extra-small"
          tooltip={{ label: presentation.string.Cancel }}
          on:click={cancelEdit}
        />
        <IconButton
          icon={IconCheck}
          kind="ghost"
          size="extra-small"
          tooltip={{ label: presentation.string.Save }}
          on:click={saveEdit}
        />
      </div>
    </div>
  {:else if text !== ''}
    <div class="text"><MessageViewer message={markup} /></div>
  {/if}
</div>

<style lang="scss">
  .voice-attachment {
    display: flex;
    flex-direction: column;
    gap: 0.375rem;
    box-sizing: border-box;
    width: 20rem;
    max-width: 100%;
    padding: 0.125rem 0;
  }

  .bar {
    min-width: 0;
  }

  .status {
    display: flex;
    align-items: center;
    gap: 0.375rem;
    font-size: 0.8125rem;
    color: var(--theme-dark-color);
  }

  .text {
    min-width: 0;
    font-size: 0.8125rem;
    overflow-wrap: anywhere;
    color: var(--theme-content-color);
  }

  // The look of the message input: without a frame the editor reads as the transcript itself.
  .field {
    display: flex;
    align-items: flex-end;
    gap: 0.25rem;
    padding: 0.375rem 0.375rem 0.375rem 0.625rem;
    font-size: 0.8125rem;
    border: 1px solid var(--theme-refinput-border);
    border-radius: var(--medium-BorderRadius);
    background-color: var(--theme-refinput-color);
  }

  .editor {
    flex: 1;
    min-width: 0;
  }

  .actions {
    display: flex;
    gap: 0.125rem;
  }
</style>
