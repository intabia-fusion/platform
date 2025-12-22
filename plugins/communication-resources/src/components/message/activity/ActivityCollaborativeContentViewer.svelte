<!--
// Copyright © 2025 Hardcore Engineering Inc.
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
  import { ActivityCollaborativeChange } from '@hcengineering/communication-types'
  import ui, { Label } from '@hcengineering/ui'
  import { AttributeModel } from '@hcengineering/view'
  import { MarkupDiffPresenter } from '@hcengineering/view-resources'

  import communication from '../../../plugin'

  export let model: AttributeModel | undefined = undefined
  export let update: ActivityCollaborativeChange
  export let compact = false

  $: isTooLarge =
    update.value === communication.string.ValueTooLarge || update.prevValue === communication.string.ValueTooLarge

  let isDiffShown = false

  function toggleShowMore (): void {
    isDiffShown = !isDiffShown
  }
</script>

<span class="content">
  <span class="label flex-gap-1 no-word-wrap flex-wrap" class:compact>
    {#if model !== undefined}
      <Label label={model.label} />
      <span class="lower"><Label label={communication.string.Edited} /></span>
    {/if}
    {#if isTooLarge}
      <Label label={communication.string.ValueTooLarge} />
    {:else}
      <span class="showMore" on:click={toggleShowMore}>
        <span class="triangle" class:left={!isDiffShown} class:down={isDiffShown} />
        <Label label={isDiffShown ? ui.string.ShowLess : ui.string.ShowMore} />
      </span>
    {/if}
  </span>
  {#if isDiffShown}
    <MarkupDiffPresenter value={update.value} prevValue={update.prevValue} showOnlyDiff withShowMore={false} />
  {/if}
</span>

<style lang="scss">
  .content {
    display: flex;
    flex-direction: column;
  }

  .label {
    display: flex;
    align-items: center;
    min-height: 2.5rem;

    &.compact {
      min-height: 1.5rem;
    }
  }
  .showMore {
    display: flex;
    color: var(--global-primary-LinkColor);
    cursor: pointer;
    font-weight: 500;
    align-items: center;
    gap: 0.25rem;
    margin-left: 0.5rem;
    user-select: none;

    .triangle {
      width: 0;
      height: 0;

      &.left {
        border-top: 0.25rem solid transparent;
        border-bottom: 0.25rem solid transparent;
        border-left: 0.25rem solid var(--global-primary-LinkColor);
        border-right: none;
      }

      &.down {
        border-left: 0.25rem solid transparent;
        border-right: 0.25rem solid transparent;
        border-top: 0.25rem solid var(--global-primary-LinkColor);
        border-bottom: none;
      }
    }

    &:hover {
      color: var(--global-focus-BorderColor);

      .triangle {
        &.left {
          border-left-color: var(--global-focus-BorderColor);
        }

        &.down {
          border-top-color: var(--global-focus-BorderColor);
        }
      }
    }
  }
</style>
