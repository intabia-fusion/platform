<script lang="ts">
  import { EmployeePresenter, SystemAvatar, getPersonByPersonIdCb } from '@intabiafusion/contact-resources'
  import Avatar from '@intabiafusion/contact-resources/src/components/Avatar.svelte'
  import core, { getDisplayTime } from '@intabiafusion/core'
  import { MessageViewer } from '@intabiafusion/presentation'
  import { Label } from '@intabiafusion/ui'
  import { GithubReviewComment } from '@intabiafusion/github'
  import { Person } from '@intabiafusion/contact'

  export let comment: GithubReviewComment

  $: personId = comment?.createdBy ?? comment?.modifiedBy
  let person: Person | undefined
  $: if (personId !== undefined) {
    getPersonByPersonIdCb(personId, (p) => {
      person = p ?? undefined
    })
  } else {
    person = undefined
  }
</script>

{#if comment}
  <div>
    <div class="flex-row-center">
      <div class="min-w-6 mt-1">
        {#if $$slots.icon}
          <slot name="icon" />
        {:else if person}
          <Avatar size="tiny" {person} name={person.name} />
        {:else}
          <SystemAvatar size="tiny" />
        {/if}
      </div>
      <div class="header clear-mins flex-row-center">
        {#if person}
          <EmployeePresenter value={person} shouldShowAvatar={false} />
        {:else}
          <div class="strong">
            <Label label={core.string.System} />
          </div>
        {/if}

        <span class="text-sm ml-2">{getDisplayTime(comment.createdOn ?? 0)}</span>
      </div>
    </div>
    <div class="customContent p-2">
      <MessageViewer message={comment.body} />
    </div>
  </div>
{/if}

<style lang="scss">
  .customContent {
    display: flex;
    flex-wrap: wrap;
    column-gap: 0.625rem;
    row-gap: 0.625rem;
  }
</style>
