<!--
// Copyright © 2026 Intabia Fusion.
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
  import { SortingOrder, type Ref, type Space, type WithLookup } from '@hcengineering/core'
  import { createQuery, getClient, refreshQueries } from '@hcengineering/presentation'
  import attachment, { type Attachment } from '@hcengineering/attachment'
  import drive, { type Drive, type File, type FileVersion } from '@hcengineering/drive'
  import ui, { Button, Loading, showPopup } from '@hcengineering/ui'
  import { filesize } from 'filesize'
  import { deleteObjects, FixedColumn, getActions, invokeAction, ObjectPresenter } from '@hcengineering/view-resources'
  import contact from '@hcengineering/contact'
  import view from '@hcengineering/view'
  import { createEventDispatcher } from 'svelte'
  import billing from '../plugin'

  export let space: Ref<Space> | undefined = undefined

  const limit = 20

  let attachments: Attachment[] | undefined
  let versions: Array<WithLookup<FileVersion>> | undefined
  let deletingFiles = new Set<Ref<File>>()
  $: files = [...(attachments ?? []), ...(versions ?? [])].sort((a, b) => b.size - a.size).slice(0, limit)
  $: loading = attachments === undefined || versions === undefined

  const attachmentQuery = createQuery()
  const versionQuery = createQuery()
  const client = getClient()

  $: attachmentQuery.query(
    attachment.class.Attachment,
    space != null ? { space } : {},
    (res) => {
      attachments = res
    },
    {
      sort: { size: SortingOrder.Descending },
      limit
    }
  )
  $: versionQuery.query(
    drive.class.FileVersion,
    space != null ? { space: space as Ref<Drive> } : {},
    (res) => {
      versions = res
    },
    { lookup: { attachedTo: drive.class.File }, sort: { size: SortingOrder.Descending }, limit }
  )
  const dispatch = createEventDispatcher()

  function isVersion (file: Attachment | WithLookup<FileVersion>): file is WithLookup<FileVersion> {
    return file._class === drive.class.FileVersion
  }

  async function deleteDriveFile (file: File, event: MouseEvent): Promise<void> {
    if (deletingFiles.has(file._id)) return
    deletingFiles.add(file._id)
    deletingFiles = deletingFiles
    try {
      const actions = await getActions(client, file)
      const action = actions.find((item) => item.target === drive.class.File && item.action === view.actionImpl.Delete)
      if (action === undefined) return
      await invokeAction(file, event, action, {
        confirmation: billing.string.DeleteDriveFileConfirm,
        afterDelete: async () => dispatch('refresh')
      })
    } finally {
      deletingFiles.delete(file._id)
      deletingFiles = deletingFiles
    }
  }
</script>

{#if loading}
  <Loading />
{:else if files.length > 0}
  <div class="files-list">
    {#each files as file, i}
      <div class="file-row flex flex-between">
        <span class="file-index">{i + 1}.</span>
        <div class="flex flex-row-center flex-grow">
          {#if isVersion(file)}
            <FixedColumn key="file-link">{file.title}</FixedColumn>
            <ObjectPresenter _class={file._class} value={file} objectId={file._id} />
          {:else}
            <FixedColumn key="file-link">
              <ObjectPresenter
                _class={file._class}
                value={file}
                objectId={file._id}
                inline
                props={{ showSize: false }}
              />
            </FixedColumn>
          {/if}
          {#if !isVersion(file)}
            <div class="file-type">
              <FixedColumn key="source-link">
                <ObjectPresenter
                  _class={file.attachedToClass}
                  objectId={file.attachedTo}
                  inline
                  props={{ kind: 'list' }}
                />
              </FixedColumn>
            </div>
          {/if}
        </div>
        <span class="file-size">{filesize(file.size, { spacer: ' ' })}</span>
        {#if isVersion(file)}
          {@const parent = file.$lookup?.attachedTo}
          {#if parent !== undefined}
            {#await getActions(client, parent) then actions}
              {@const action = actions.find(
                (item) => item.target === drive.class.File && item.action === view.actionImpl.Delete
              )}
              {#if action !== undefined}
                <Button
                  icon={ui.icon.Trash}
                  label={view.string.Delete}
                  loading={deletingFiles.has(parent._id)}
                  on:click={(event) => deleteDriveFile(parent, event)}
                />
              {/if}
            {/await}
          {/if}
        {:else}
          <Button
            icon={ui.icon.Trash}
            label={view.string.Delete}
            on:click={() => {
              showPopup(
                contact.component.DeleteConfirmationPopup,
                {
                  object: file,
                  skipCheck: true,
                  confirmation: undefined,
                  deleteAction: async () => {
                    try {
                      await deleteObjects(getClient(), [file], true)
                      attachments = attachments?.filter((item) => item._id !== file._id)
                      dispatch('delete', file.size)
                      await refreshQueries([attachment.class.Attachment])
                    } catch (e) {
                      console.error(e)
                    }
                  }
                },
                undefined
              )
            }}
          />
        {/if}
      </div>
    {/each}
  </div>
{/if}

<style lang="scss">
  .files-list {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  .file-row {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.375rem 0.5rem;
    border-radius: 0.25rem;
    background-color: var(--theme-button-default);

    &:hover {
      background-color: var(--theme-button-hovered);
    }
  }

  .file-index {
    color: var(--theme-halfcontent-color);
    font-size: 0.8125rem;
    min-width: 1.5rem;
  }

  .file-name {
    flex: 1;
    font-size: 0.8125rem;
    color: var(--theme-caption-color);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    min-width: 15rem;
    max-width: 20rem;
  }

  .file-type {
    font-size: 0.75rem;
    color: var(--theme-halfcontent-color);
    white-space: nowrap;
    max-width: 20rem;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .file-size {
    font-size: 0.8125rem;
    font-weight: 500;
    color: var(--theme-caption-color);
    white-space: nowrap;
    min-width: 4rem;
    text-align: right;
  }
</style>
