<script lang="ts">
  import { getContext, onDestroy } from 'svelte'
  import { createQuery, getClient } from '@hcengineering/presentation'
  import { makeDocCollabId, type Doc } from '@hcengineering/core'
  import attachmentPlugin, { type Attachment } from '@hcengineering/attachment'
  import { AttachmentPresenter } from '@hcengineering/attachment-resources'
  import { CollaborationIds } from '@hcengineering/text-editor'
  import {
    CollaborationDiffViewer,
    Provider,
    StringDiffViewer,
    createTiptapCollaborationData
  } from '@hcengineering/text-editor-resources'
  import { Dropdown, Label, ListItem, Loading, Scroller, themeStore } from '@hcengineering/ui'
  import documents, {
    ControlledDocument,
    ControlledDocumentSnapshot,
    ControlledDocumentState,
    Document,
    DocumentState
  } from '@hcengineering/controlled-documents'
  import plugin from '../../plugin'
  import {
    $controlledDocument as controlledDocument,
    $comparedDocument as compareTo,
    $documentComparisonVersions as documentComparisonVersions,
    comparisonRequested
  } from '../../stores/editors/document'
  import { getTranslatedControlledDocStates, getTranslatedDocumentStates } from '../../utils'
  import DocumentTitle from './DocumentTitle.svelte'

  const client = getClient()
  const hierarchy = client.getHierarchy()
  const ydoc: any = getContext(CollaborationIds.Doc)

  let comparedYdoc: any | undefined = undefined
  let comparedProvider: Provider | undefined = undefined
  let loading = true

  const handleSelect = (event: CustomEvent<ListItem>) => {
    const version = $documentComparisonVersions.find((item) => item._id === event.detail._id)
    if (version) {
      comparisonRequested(version)
    }
  }

  let translatedStates: Readonly<Record<DocumentState | ControlledDocumentState, string>> | null = null
  function getTranslatedLabels (lang: string) {
    Promise.all([getTranslatedDocumentStates(lang), getTranslatedControlledDocStates(lang)]).then(
      ([states, controlledStates]) => {
        translatedStates = {
          ...states,
          ...controlledStates
        }
      }
    )
  }

  function isDocument (document: Doc | null): document is Document {
    if (document == null) {
      return false
    }

    return hierarchy.isDerived(document._class, documents.class.Document)
  }

  const generateVersionName = (
    document: ControlledDocument | ControlledDocumentSnapshot,
    translatedStates: Readonly<Record<DocumentState | ControlledDocumentState, string>> | null
  ): string => {
    let state: ControlledDocumentState | DocumentState | undefined = document.controlledState
    if (state == null) {
      state = document.state ?? DocumentState.Draft
    }

    if (isDocument(document)) {
      return `v${document.major}.${document.minor} | ${translatedStates ? translatedStates[state] : ''}`
    } else {
      return `${document.name} | ${translatedStates ? translatedStates[state] : ''}`
    }
  }

  $: getTranslatedLabels($themeStore.language)
  $: versionItems = $documentComparisonVersions.map((version) => ({
    _id: version._id,
    label: generateVersionName(version, translatedStates)
  }))
  $: if ($compareTo) {
    if (comparedProvider) {
      comparedProvider.destroy()
    }
    loading = true

    const compareToDoc = makeDocCollabId($compareTo, 'content')
    const data = createTiptapCollaborationData(compareToDoc, $compareTo.content)
    comparedYdoc = data.ydoc
    comparedProvider = data.provider
    void comparedProvider.loaded.then(() => (loading = false))
  }

  function isVisible (att: Attachment): boolean {
    if (!hierarchy.hasMixin(att, documents.mixin.DocumentAttachment)) return true
    return hierarchy.as(att, documents.mixin.DocumentAttachment).deletedIn == null
  }

  let currentAttachments: Attachment[] = []
  let comparedAttachments: Attachment[] = []

  const currentQuery = createQuery()
  $: currentQuery.query(attachmentPlugin.class.Attachment, { attachedTo: $controlledDocument?._id }, (res) => {
    currentAttachments = res.filter(isVisible)
  })

  const comparedQuery = createQuery()
  $: comparedQuery.query(attachmentPlugin.class.Attachment, { attachedTo: $compareTo?._id }, (res) => {
    comparedAttachments = res.filter(isVisible)
  })

  interface AttachmentDiff {
    att: Attachment
    status: 'added' | 'removed' | 'unchanged'
  }

  $: attachmentDiff = ((): AttachmentDiff[] => {
    const comparedByName = new Map(comparedAttachments.map((a) => [a.name, a]))
    const currentNames = new Set(currentAttachments.map((a) => a.name))

    const diff: AttachmentDiff[] = currentAttachments.map((att) => ({
      att,
      status: comparedByName.has(att.name) ? 'unchanged' : 'added'
    }))

    for (const att of comparedAttachments) {
      if (!currentNames.has(att.name)) {
        diff.push({ att, status: 'removed' })
      }
    }

    return diff
  })()

  onDestroy(() => {
    void comparedProvider?.destroy()
  })
</script>

<div class="flex flex-gap-2 h-12 pl-7 items-center bottom-divider">
  <Label label={plugin.string.Compare} />
  <Dropdown
    items={versionItems}
    disabled
    selected={versionItems.find((item) => item._id === $controlledDocument?._id)}
    withSearch={false}
    placeholder={documents.string.Version}
  />
  <Label label={plugin.string.Against} />
  <Dropdown
    items={versionItems}
    selected={versionItems.find((item) => item._id === $compareTo?._id)}
    withSearch={false}
    placeholder={documents.string.Version}
    on:selected={handleSelect}
  />
</div>
{#if loading}
  <Loading />
{:else}
  <Scroller>
    <div class="root">
      <DocumentTitle>
        <StringDiffViewer
          value={$controlledDocument?.title ?? ''}
          compareTo={(isDocument($compareTo) ? $compareTo : $controlledDocument)?.title ?? ''}
        />
      </DocumentTitle>
      <CollaborationDiffViewer field="content" comparedField="content" {ydoc} {comparedYdoc} />
      {#if attachmentDiff.length > 0}
        <div class="attachments">
          <div class="attachments-header"><Label label={attachmentPlugin.string.Attachments} /></div>
          {#each attachmentDiff as item (item.att._id)}
            <div class="attachment-row" class:added={item.status === 'added'} class:removed={item.status === 'removed'}>
              <span class="diff-mark">{item.status === 'added' ? '+' : item.status === 'removed' ? '-' : ''}</span>
              <AttachmentPresenter value={item.att} />
            </div>
          {/each}
        </div>
      {/if}
      <div class="bottomSpacing" />
    </div>
  </Scroller>
{/if}

<style lang="scss">
  .root {
    padding: 0 3.25rem;
  }

  .bottomSpacing {
    padding-bottom: 30vh;
  }

  .attachments {
    margin-top: 2rem;
    border-top: 1px solid var(--theme-divider-color);
    padding-top: 1rem;
  }

  .attachments-header {
    font-weight: 500;
    margin-bottom: 0.75rem;
  }

  .attachment-row {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.25rem 0.5rem;
    border-radius: 0.25rem;

    .diff-mark {
      width: 1rem;
      font-weight: 700;
      text-align: center;
    }

    &.added {
      background-color: var(--theme-won-color-trans, rgba(0, 180, 100, 0.1));
    }

    &.removed {
      background-color: var(--theme-lost-color-trans, rgba(220, 60, 60, 0.1));

      :global(.name) {
        text-decoration: line-through;
      }
    }
  }
</style>
