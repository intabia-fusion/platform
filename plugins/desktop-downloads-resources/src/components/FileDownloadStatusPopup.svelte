<!--
// Copyright © 2025 Hardcore Engineering Inc.
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
  import type { IntlString } from '@hcengineering/platform'
  import { getEmbeddedLabel, translate } from '@hcengineering/platform'
  import ui, { humanReadableFileSize, Icon, Label, ProgressCircle, Scroller, tooltip } from '@hcengineering/ui'
  import { IconButton } from '@hcengineering/ui/kit'
  import { createEventDispatcher } from 'svelte'

  import plugin from '../plugin'
  import { downloads } from '../store'
  import {
    openDownloadItem,
    revealDownloadItem,
    type DownloadActionStatus,
    type DownloadItem,
    type DownloadItemState
  } from '@hcengineering/desktop-downloads'

  const dispatch = createEventDispatcher<{ close: undefined }>()

  const labels: Record<DownloadItemState, IntlString> = {
    completed: plugin.string.Completed,
    cancelled: plugin.string.Cancelled,
    interrupted: plugin.string.Interrupted,
    paused: plugin.string.Paused,
    progressing: plugin.string.Progressing
  }

  // Per row: one message over the whole list would not say which download it is about.
  let failures = new Map<string, DownloadActionStatus>()
  // The action crosses IPC and the OS: a rage click must not run it twice. Read back by `disabled` on the buttons.
  let busy = ''

  function failureLabel (status: DownloadActionStatus): IntlString {
    return status === 'failed' || status === 'unavailable' ? plugin.string.OpenFailed : plugin.string.FileMissing
  }

  async function runAction (item: DownloadItem, action: (key: string) => Promise<DownloadActionStatus>): Promise<void> {
    if (busy === item.key) return
    busy = item.key
    try {
      const status = await action(item.key)
      // `cancelled` is the user saying no to the OS confirmation: nothing happened, nothing to report.
      if (status === 'ok') {
        dispatch('close')
        return
      }
      if (status === 'cancelled') return
      failures = new Map(failures).set(item.key, status)
    } finally {
      busy = ''
    }
  }

  function handleReveal (item: DownloadItem): void {
    void runAction(item, revealDownloadItem)
  }

  async function handleOpen (item: DownloadItem): Promise<void> {
    // The OS dialog is native: the main process cannot read our locale, so its texts are translated here.
    const confirm = {
      title: await translate(plugin.string.OpenFile, {}),
      message: await translate(plugin.string.OpenExecutable, {}),
      open: await translate(plugin.string.Open, {}),
      cancel: await translate(ui.string.Cancel, {})
    }
    await runAction(item, async (key) => await openDownloadItem(key, confirm))
  }
</script>

<div class="antiPopup upload-popup">
  <div class="upload-popup__header flex-row-center flex-gap-1">
    <div class="label overflow-label font-medium-14">
      <Label label={plugin.string.Downloads} />
    </div>
  </div>

  <Scroller>
    <div class="upload-popup__content flex-col flex-no-shrink flex-gap-4">
      {#each $downloads as item}
        {@const progress = item.totalBytes > 0 ? Math.ceil((item.receivedBytes / item.totalBytes) * 100) : 0}
        {@const failure = failures.get(item.key)}
        <div class="upload-file-row flex-row-center justify-start flex-gap-4">
          <div class="upload-file-row__status w-4">
            {#if item.state === 'completed'}
              <Icon icon={ui.icon.CheckCircle} size="small" fill="var(--positive-button-default)" />
            {:else}
              <ProgressCircle value={progress} size="small" primary />
            {/if}
          </div>

          <div class="upload-file-row__content flex-col flex-gap-1">
            <div
              class="label overflow-label font-medium-14"
              use:tooltip={{ label: getEmbeddedLabel(item.savePath !== '' ? item.savePath : item.fileName) }}
            >
              {item.fileName}
            </div>
            <div class="flex-row-center flex-gap-2 text-sm">
              <span>{humanReadableFileSize(item.receivedBytes)}</span>
              {#if item.totalBytes > 0 && item.totalBytes !== item.receivedBytes}
                <span>/</span>
                <span>{humanReadableFileSize(item.totalBytes)}</span>
              {/if}
              <span>•</span>

              <Label label={labels[item.state]} />
            </div>
            {#if failure !== undefined}
              <div class="upload-file-row__error text-sm" role="alert">
                <Label label={failureLabel(failure)} />
              </div>
            {/if}
          </div>

          <div class="upload-file-row__tools flex-row-center">
            {#if item.state === 'completed' && failure !== 'missing' && failure !== 'unknown'}
              <IconButton
                icon={ui.icon.Folder}
                tooltip={{ label: plugin.string.ShowInFolder }}
                kind="ghost"
                size="small"
                disabled={busy === item.key}
                on:click={() => {
                  handleReveal(item)
                }}
              />
              {#if failure === undefined}
                <IconButton
                  icon={ui.icon.OpenFile}
                  tooltip={{ label: plugin.string.OpenFile }}
                  kind="ghost"
                  size="small"
                  disabled={busy === item.key}
                  on:click={() => {
                    void handleOpen(item)
                  }}
                />
              {/if}
            {/if}
          </div>
        </div>
      {/each}
    </div>
  </Scroller>
</div>

<style lang="scss">
  .upload-popup {
    padding: var(--spacing-2);
    max-height: 30rem;

    .upload-popup__header {
      padding-bottom: 1rem;
      margin-left: 0.5rem;
      margin-right: 0.625rem;
    }

    .upload-popup__content {
      margin: 0.5rem;
      margin-right: 0.625rem;
    }
  }

  .upload-file-row {
    .upload-file-row__content {
      flex-grow: 2;
    }

    .upload-file-row__error {
      color: var(--global-error-TextColor, #f87171);
    }

    .upload-file-row__tools {
      flex-shrink: 0;
      opacity: 0;
      transition: opacity 0.15s ease-in-out;
    }

    &:hover .upload-file-row__tools,
    &:focus-within .upload-file-row__tools {
      opacity: 1;
    }
  }
</style>
