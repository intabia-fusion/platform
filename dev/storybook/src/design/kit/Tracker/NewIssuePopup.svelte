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
  // Create issue dialog (CreateIssue in a presentation Card): project and template selectors, title, description, attribute pool and footer
  import ui, { Button, Icon as UiIcon } from '@hcengineering/ui'
  import { IconButton } from '@hcengineering/ui/kit'

  import Card from '../Actions/Card.svelte'
  import Icon from '../Icon.svelte'
  import { productIcon } from '../productIcon'
  import StatusIcon from '../Status/StatusIcon.svelte'
  import type { Status } from '../types'

  export let project: string = 'Default'
  export let status: Status = { name: 'Backlog', category: 'backlog' }

  const ic = (name: string): any => productIcon(name)
</script>

<Card title="New issue" headerNoPadding>
  <svelte:fragment slot="header">
    <Button kind="regular" size="small" icon={ic('kit/HouseFill')}>
      <svelte:fragment slot="content"><span class="overflow-label disabled text">{project}</span></svelte:fragment>
    </Button>
    <div class="min-w-0">
      <Button kind="regular" size="small" notSelected>
        <svelte:fragment slot="content"
          ><div class="overflow-label flex-grow">
            <div class="disabled flex-row-center">No template</div>
          </div></svelte:fragment
        >
      </Button>
    </div>
  </svelte:fragment>
  <svelte:fragment slot="title">
    <div class="flex-row-center gap-2 pt-1 pb-1 pr-1">
      <span class="overflow-label">New issue</span>
      <div class="min-w-0 ml-2">
        <Button kind="regular" size="small" width="10rem">
          <svelte:fragment slot="content">
            <div class="btn-icon pointer-events-none"><Icon name="kit/CheckSquare" /></div>
            <span class="overflow-label disabled flex-grow text-left mr-2">Issue</span>
            <UiIcon icon={ui.icon.ChevronDown} size="small" />
          </svelte:fragment>
        </Button>
      </div>
    </div>
  </svelte:fragment>
  <svelte:fragment slot="header-actions">
    <IconButton kind="tertiary" size="small" icon={ic('kit/Sparkle')} iconSize="medium" aria-label="AI" />
  </svelte:fragment>

  <div class="m-3 clear-mins">
    <div class="antiEditBox flex-grow w-full">
      <div class="large-style flex-row-center clear-mins w-full">
        <input class="antiEditBoxInput" placeholder="Issue title" />
      </div>
    </div>
  </div>
  <div>
    <div class="flex-col clear-mins">
      <div class="flex-col styled-box antiIndented m-3 description">Add description...</div>
    </div>
  </div>

  <svelte:fragment slot="pool">
    <div class="pool-item">
      <Button kind="regular" size="large" justify="left" shape={undefined}>
        <svelte:fragment slot="content">
          <StatusIcon {status} size="x-small" /><span class="overflow-label disabled ml-2">{status.name}</span>
        </svelte:fragment>
      </Button>
    </div>
    <div class="pool-item">
      <Button kind="regular" size="large" icon={ic('tracker/priority-nopriority')}>
        <svelte:fragment slot="content"
          ><span class="overflow-label label disabled pointer-events-none">No priority</span></svelte:fragment
        >
      </Button>
    </div>
    <div class="pool-item">
      <Button kind="regular" size="large" justify="left" notSelected>
        <svelte:fragment slot="content"
          ><span class="dark-color flex-center"
            ><UiIcon icon={ic('kit/PersonCircle')} size="small" /><span class="ml-1-5">Assignee</span></span
          ></svelte:fragment
        >
      </Button>
    </div>
    <div class="pool-item">
      <Button kind="regular" size="large" icon={ic('kit/Tag')} notSelected>
        <svelte:fragment slot="content"
          ><span class="overflow-label label disabled pointer-events-none">Labels</span></svelte:fragment
        >
      </Button>
    </div>
    <div class="pool-item">
      <Button kind="regular" size="large" icon={ic('kit/Diamond')} notSelected>
        <svelte:fragment slot="content"
          ><span class="label text-md overflow-label pointer-events-none">No component</span></svelte:fragment
        >
      </Button>
    </div>
    <div class="pool-item new-line">
      <Button kind="regular" size="large" justify="left" icon={ic('kit/CircleHalfFill')} notSelected>
        <svelte:fragment slot="content"><span>0h</span></svelte:fragment>
      </Button>
    </div>
    <div class="pool-item new-line">
      <Button kind="regular" size="large" icon={ic('kit/Signpost')} notSelected>
        <svelte:fragment slot="content"
          ><span class="label text-md overflow-label pointer-events-none">Milestone</span></svelte:fragment
        >
      </Button>
    </div>
    <div class="pool-item new-line">
      <Button kind="regular" size="large" icon={ic('kit/Calendar')} notSelected padding="0 1rem 0 0.75rem">
        <svelte:fragment slot="content"><span class="not-selected">Due date</span></svelte:fragment>
      </Button>
    </div>
    <div class="pool-item new-line">
      <Button kind="regular" size="large" icon={ic('tracker/parent-issue')} notSelected>
        <svelte:fragment slot="content"
          ><span class="overflow-label label disabled pointer-events-none">Set parent issue…</span></svelte:fragment
        >
      </Button>
    </div>
  </svelte:fragment>

  <svelte:fragment slot="buttons">
    <div class="w-full flex-row-center">
      <Button kind="primary" size="large" shape="rectangle-right" borderStyle="none" disabled>
        <svelte:fragment slot="content">
          <div class="flex-row-center w-full flex-between relative">
            <span class="overflow-label">Create issue</span>
            <div class="primary vertical-divider max-h-5 h-5" />
          </div>
        </svelte:fragment>
      </Button>
      <Button
        kind="primary"
        size="large"
        icon={ui.icon.ChevronDown}
        shape="rectangle-left"
        borderStyle="none"
        width="1.75rem"
        disabled
      />
    </div>
  </svelte:fragment>
  <svelte:fragment slot="footer">
    <Button kind="ghost" size="large" icon={ui.icon.Paperclip} />
  </svelte:fragment>
</Card>

<style lang="scss">
  .description {
    box-sizing: border-box;
    min-height: 2.3125rem;
    padding: 0.5rem 0;
    color: var(--theme-dark-color);
  }
  .pool-item {
    margin: 0.5rem 0.5rem 0 0;
  }
</style>
