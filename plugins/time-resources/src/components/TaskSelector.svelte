<script lang="ts">
  import { Class } from '@intabiafusion/core'
  import { getClient } from '@intabiafusion/presentation'
  import { Task } from '@intabiafusion/task'
  import { Button, Icon, Label, showPanel } from '@intabiafusion/ui'
  import view, { ObjectPanel } from '@intabiafusion/view'
  import { ToDo } from '@intabiafusion/time'
  import time from '../plugin'
  import WorkItemPresenter from './WorkItemPresenter.svelte'

  export let value: ToDo | undefined
  export let focusIndex = -1

  const client = getClient()
  const hierarchy = client.getHierarchy()

  function click (e: MouseEvent) {
    if (value && value.attachedTo !== time.ids.NotAttached) {
      const panelComponent = hierarchy.classHierarchyMixin<Class<Task>, ObjectPanel>(
        value.attachedToClass,
        view.mixin.ObjectPanel
      )
      const component = panelComponent?.component ?? view.component.EditDoc
      showPanel(component, value.attachedTo, value.attachedToClass, 'content')
    }
  }
</script>

{#if value && value.attachedTo !== time.ids.NotAttached}
  <div class="flex-row-center gap-1-5">
    <Icon icon={time.icon.Hashtag} size={'small'} />
    <Button kind={'ghost'} padding={'0 .5rem'} {focusIndex} shrink={1} on:click={click}>
      <svelte:fragment slot="content">
        {#if value}
          <WorkItemPresenter todo={value} withoutSpace />
        {:else}
          <Label label={time.string.WorkItem} />
        {/if}
      </svelte:fragment>
    </Button>
  </div>
{/if}
