<script lang="ts">
  import { Doc, DocumentQuery } from '@intabiafusion/core'
  import { IntlString } from '@intabiafusion/platform'
  import { pluginConfigurationStore } from '@intabiafusion/presentation'
  import tracker, { Issue, trackerId } from '@intabiafusion/tracker'
  import { Icon, Label } from '@intabiafusion/ui'
  import QueryIssuesList from '../edit/QueryIssuesList.svelte'

  export let object: Doc
  export let label: IntlString

  let query: DocumentQuery<Issue>
  $: query = { relations: { _id: object._id, _class: object._class } }
</script>

{#if $pluginConfigurationStore.has(trackerId)}
  <QueryIssuesList {object} {query} createParams={{ relatedTo: object }} hasSubIssues>
    <svelte:fragment slot="header">
      <div class="flex-row-center">
        <div class="antiSection-header__icon">
          <Icon icon={tracker.icon.Issue} size={'small'} />
        </div>
        <span class="antiSection-header__title short">
          <Label {label} />
        </span>
      </div>
    </svelte:fragment>
  </QueryIssuesList>
{/if}
