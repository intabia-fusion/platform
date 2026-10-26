<!--
//
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
//
-->
<script lang="ts">
  import type { Schedule } from '@hcengineering/calendar'
  import { getCurrentEmployee } from '@hcengineering/contact'
  import presentation, {
    copyTextToClipboard,
    createQuery,
    getClient,
    getCurrentWorkspaceUrl,
    MessageBox
  } from '@hcengineering/presentation'
  import type { Action } from '@hcengineering/ui'
  import ui, { NavItem, showPopup } from '@hcengineering/ui'
  import { IconButton } from '@hcengineering/ui/kit'
  import view from '@hcengineering/view'
  import { TreeElement } from '@hcengineering/view-resources'
  import { SortingOrder } from '@hcengineering/core'
  import { getMetadata } from '@hcengineering/platform'

  import ScheduleEditor from './ScheduleEditor.svelte'
  import calendar from '../plugin'

  const currentUser = getCurrentEmployee()
  const scheduleUrl = getMetadata(calendar.metadata.PublicScheduleURL)

  const scheduleQuery = createQuery()
  let schedules: Schedule[] = []

  scheduleQuery.query(
    calendar.class.Schedule,
    {
      owner: currentUser
    },
    (res) => {
      schedules = res
    },
    {
      sort: { title: SortingOrder.Ascending }
    }
  )

  async function getScheduleListActions (): Promise<Action[]> {
    return [
      {
        icon: ui.icon.Plus,
        label: calendar.string.ScheduleNew,
        inline: true,
        action: async () => {
          showPopup(ScheduleEditor, {}, undefined)
        }
      }
    ]
  }

  function deleteSchedule (schedule: Schedule): void {
    showPopup(
      MessageBox,
      {
        label: calendar.string.Value,
        labelProps: { value: schedule.title },
        message: calendar.string.ScheduleDeleteConfirm,
        params: { title: schedule.title },
        richMessage: true,
        dangerous: true,
        action: async () => {
          const client = getClient()
          await client.remove(schedule)
        }
      },
      undefined
    )
  }

  function shareLink (schedule: Schedule): void {
    const ws = getCurrentWorkspaceUrl()
    const link = `${scheduleUrl}/${ws}/${schedule._id}`
    showPopup(
      MessageBox,
      {
        label: calendar.string.Value,
        labelProps: { value: schedule.title },
        message: calendar.string.ScheduleSharedLinkMessage,
        params: { link },
        richMessage: true,
        okLabel: presentation.string.CopyLink,
        canSubmit: false,
        action: async () => {
          await copyTextToClipboard(link)
        }
      },
      undefined
    )
  }
</script>

{#if scheduleUrl !== undefined}
  <TreeElement _id="schedules-section" label={calendar.string.Schedule} actions={getScheduleListActions} parent>
    {#if schedules.length === 0}
      <NavItem
        label={calendar.string.ScheduleNew}
        icon={ui.icon.Plus}
        type="type-object"
        on:click={() => {
          showPopup(ScheduleEditor, {}, undefined)
        }}
      />
    {:else}
      {#each schedules as schedule}
        <NavItem
          title={schedule.title}
          icon={calendar.icon.Calendar}
          type="type-object"
          on:click={() => {
            showPopup(ScheduleEditor, { schedule }, undefined)
          }}
        >
          <svelte:fragment slot="actions">
            <IconButton
              icon={ui.icon.Link}
              size="extra-small"
              kind="tertiary"
              tooltip={{ label: calendar.string.ScheduleShareLink, direction: 'top' }}
              on:click={() => {
                shareLink(schedule)
              }}
            />
            <IconButton
              icon={ui.icon.Trash}
              size="extra-small"
              kind="tertiary"
              tooltip={{ label: view.string.Delete, direction: 'top' }}
              on:click={() => {
                deleteSchedule(schedule)
              }}
            />
          </svelte:fragment>
        </NavItem>
      {/each}
    {/if}
  </TreeElement>
{/if}
