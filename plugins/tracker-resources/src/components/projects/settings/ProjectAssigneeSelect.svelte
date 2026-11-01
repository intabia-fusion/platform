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
  import contact, { getName } from '@hcengineering/contact'
  import type { Employee, Person } from '@hcengineering/contact'
  import { AssigneePopup, Avatar, getPersonByPersonRefStore } from '@hcengineering/contact-resources'
  import type { Ref } from '@hcengineering/core'
  import { getClient } from '@hcengineering/presentation'
  import { Icon, Label, showPopup } from '@hcengineering/ui'
  import { SelectButton } from '@hcengineering/ui/kit'

  import tracker from '../../../plugin'

  // Default assignee of a project's new issues; `undefined` - unassigned
  export let value: Ref<Employee> | undefined
  export let onChange: (value: Ref<Employee> | undefined) => void | Promise<void>

  const hierarchy = getClient().getHierarchy()

  $: personStore = getPersonByPersonRefStore(value !== undefined ? [value] : [])
  $: person = value !== undefined ? $personStore.get(value) : undefined

  let opened = false

  function choose (e: MouseEvent): void {
    opened = true
    showPopup(
      AssigneePopup,
      {
        _class: contact.mixin.Employee,
        docQuery: { active: true },
        icon: contact.icon.Person,
        selected: value,
        placeholder: tracker.string.Unassigned,
        allowDeselect: true,
        titleDeselect: tracker.string.Unassigned
      },
      e.currentTarget as HTMLElement,
      async (result: Person | null | undefined) => {
        opened = false
        if (result === null) {
          await onChange(undefined)
        } else if (result !== undefined && result._id !== value) {
          await onChange(result._id as Ref<Employee>)
        }
      }
    )
  }
</script>

<SelectButton
  data-id="project-default-assignee"
  empty={false}
  field
  fullWidth
  chevron
  pressed={opened}
  tooltip={{ label: tracker.string.DefaultAssignee }}
  on:click={choose}
>
  {#if person !== undefined}
    <Avatar {person} size="tiny" name={getName(hierarchy, person)} />
    <span class="overflow-label">{getName(hierarchy, person)}</span>
  {:else}
    <Icon icon={contact.icon.Person} size="small" />
    <span class="overflow-label"><Label label={tracker.string.Unassigned} /></span>
  {/if}
</SelectButton>
