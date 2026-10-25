<script lang="ts">
  import { PersonRefPresenter } from '@hcengineering/contact-resources'
  import type { DocumentValidationState } from '@hcengineering/controlled-documents'
  import ui, { Chevron, Label, tooltip, Icon } from '@hcengineering/ui'
  import { slide } from 'svelte/transition'

  import documentsRes from '../../../plugin'
  import SignatureInfo from './SignatureInfo.svelte'

  export let state: DocumentValidationState
  export let initiallyExpanded: boolean = false

  let expanded: boolean = initiallyExpanded

  const dtf = new Intl.DateTimeFormat('default', {
    day: 'numeric',
    month: 'short'
  })

  $: snapshot = state?.snapshot
  $: approvals = state?.approvals ?? []

  const roleString = {
    author: documentsRes.string.Author,
    reviewer: documentsRes.string.Reviewer,
    approver: documentsRes.string.Approver
  }
</script>

<button
  class:bottom-divider={!expanded}
  class="justify-start"
  on:click={() => {
    expanded = !expanded
  }}
>
  <div class="header flex-row-center flex-gap-1-5">
    <span class="title">
      {#if snapshot != null}
        {snapshot?.name}
      {:else}
        <Label label={documentsRes.string.CurrentVersion} />
      {/if}
    </span>
    <span>•</span>
    <span class="date">{dtf.format(state?.modifiedOn)}</span>
    <div class="chevron" class:visible={expanded}>
      <Chevron outline {expanded} size="small" />
    </div>
  </div>
</button>
{#if expanded}
  <div class="section" transition:slide|local>
    {#each approvals as approval}
      {@const messages = approval.messages ?? []}
      <div class="approver">
        <PersonRefPresenter value={approval.person} avatarSize="x-small" />
        {#key approval.timestamp}
          <span
            class="flex gap-1"
            use:tooltip={approval.timestamp !== undefined
              ? {
                  component: SignatureInfo,
                  props: {
                    id: approval.person,
                    timestamp: approval.timestamp
                  }
                }
              : undefined}
          >
            <span><Label label={roleString[approval.role]} /></span>
            {#if approval.state === 'approved'}
              <Icon icon={ui.icon.CheckCircleFill} size="medium" fill="var(--theme-docs-accepted-color)" />
            {:else if approval.state === 'rejected'}
              <Icon icon={ui.icon.CrossCircleFill} size="medium" fill="var(--negative-button-default)" />
            {:else if approval.state === 'cancelled'}
              <Icon icon={ui.icon.CrossCircle} size="medium" fill="var(--theme-dark-color)" />
            {:else if approval.state === 'waiting'}
              <Icon icon={ui.icon.QuestionCircle} size="medium" fill="var(--theme-dark-color)" />
            {/if}
          </span>
        {/key}
      </div>
      {#each messages as m}
        <div class="approval-status-message">{m.message}</div>
      {/each}
    {/each}
  </div>
{/if}

<style lang="scss">
  button:hover {
    background-color: var(--theme-button-hovered);

    &:hover {
      .chevron {
        visibility: visible;
      }
    }
  }

  .header {
    font-size: 0.8125rem;
    font-weight: 500;
    padding: 0.75rem 1rem;
    color: var(--theme-text-primary-color);

    .title {
      margin: 0 0.125rem;
    }

    .date {
      font-weight: 400;
      font-size: 0.75rem;
      margin: 0 0.125rem;
      color: var(--theme-dark-color);
    }

    .chevron {
      margin-left: 0.25rem;
      visibility: hidden;

      &.visible {
        visibility: visible;
      }
    }
  }

  .section {
    color: var(--theme-text-primary-color);
    padding: 0.75rem 1rem 1rem 1rem;
    font-weight: 500;
    flex-shrink: 0;
    border-bottom: 1px solid var(--theme-divider-color);

    .approval-status-message {
      font-weight: 400;
      padding: 0.625rem 1rem 0 2rem;
    }
  }

  .approver {
    display: flex;
    align-items: center;
    justify-content: space-between;

    &:not(:first-child) {
      margin-top: 1rem;
    }
  }
</style>
