<!--
// Copyright © 2024 Hardcore Engineering Inc.
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
  import type { Blob, BlobMetadata, Ref } from '@hcengineering/core'
  import { getResource } from '@hcengineering/platform'
  import presentation, {
    downloadFile,
    FileHeader,
    FilePreview,
    isTextFile,
    showFileViewer
  } from '@hcengineering/presentation'
  import ui, { closeTooltip } from '@hcengineering/ui'
  import { IconButton } from '@hcengineering/ui/kit'
  import type { Widget, WidgetTab } from '@hcengineering/workbench'
  import workbench from '@hcengineering/workbench'

  import attachment from '../plugin'
  import AudioPreview from './file/AudioPreview.svelte'

  export let widget: Widget
  export let tab: WidgetTab | undefined

  $: file = tab?.data?.file as Ref<Blob> | undefined
  $: name = (tab?.data?.name as string | undefined) ?? ''
  $: contentType = (tab?.data?.contentType as string | undefined) ?? ''
  $: metadata = tab?.data?.metadata as BlobMetadata | undefined
  $: size = tab?.data?.size as number | undefined
  $: sheet = isTextFile(contentType)
  $: pdf = contentType === 'application/pdf'
  $: viewer =
    contentType.startsWith('audio/') && file != null
      ? { component: AudioPreview, props: { value: { file, name, type: contentType, size: size ?? 0, metadata } } }
      : undefined

  async function closeTab (): Promise<void> {
    if (tab == null) return
    const fn = await getResource(workbench.function.CloseWidgetTab)
    await fn(widget, tab.id)
  }

  async function close (): Promise<void> {
    const fn = await getResource(workbench.function.CloseWidget)
    await fn(attachment.ids.PreviewWidget)
  }

  $: if (tab == null) {
    void close()
  } else if (tab.data == null) {
    void closeTab()
  }
</script>

<div class="preview-widget">
  <FileHeader {name} {contentType} {size}>
    {#if file != null}
      <IconButton
        icon={ui.icon.Download}
        kind="ghost"
        size="small"
        iconSize="medium"
        tooltip={{ label: presentation.string.Download }}
        on:click={() => {
          if (file != null) downloadFile(file, name)
        }}
      />
      <IconButton
        icon={ui.icon.OpenFile}
        kind="ghost"
        size="small"
        iconSize="medium"
        tooltip={{ label: attachment.string.OpenInWindow }}
        on:click={() => {
          closeTooltip()
          if (file != null) showFileViewer({ file, name, contentType, metadata, size, viewer })
        }}
      />
    {/if}
    <span class="divider" />
    <IconButton
      icon={ui.icon.Cross}
      kind="ghost"
      size="small"
      iconSize="medium"
      tooltip={{ label: presentation.string.Close }}
      on:click={closeTab}
    />
  </FileHeader>

  {#if file != null}
    <div class="stage" class:bleed={pdf || sheet}>
      <div class="content" class:paper={sheet}>
        <FilePreview {file} {contentType} {name} {metadata} {viewer} props={sheet ? { frame: false } : {}} fit />
      </div>
    </div>
  {/if}
</div>

<style lang="scss">
  .preview-widget {
    display: flex;
    flex-direction: column;
    width: 100%;
    height: 100%;
    min-height: 0;
    overflow: hidden;
  }

  .divider {
    width: 1px;
    height: 1.25rem;
    margin: 0 0.25rem;
    background-color: var(--theme-divider-color);
  }

  .stage {
    display: flex;
    flex-grow: 1;
    min-height: 0;
    padding: 0.75rem;
    overflow: hidden;

    // A document fills the width; the PDF toolbar then reads as the header's second row.
    &.bleed {
      padding: 0;
    }
  }

  .content {
    display: flex;
    width: 100%;
    height: 100%;
    min-width: 0;
    min-height: 0;

    > :global(*) {
      flex-grow: 1;
    }

    &.paper {
      overflow: hidden;
      color: var(--theme-content-color);
      user-select: text;
    }
  }
</style>
