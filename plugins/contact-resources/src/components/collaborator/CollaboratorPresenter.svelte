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
  import { AccountUuid, Collaborator, Ref } from '@hcengineering/core'
  import { IconSize } from '@hcengineering/ui'
  import { getClient } from '@hcengineering/presentation'
  import { Employee, Person } from '@hcengineering/contact'

  import ContactPresenter from '../ContactPresenter.svelte'
  import contact from '../../plugin'
  import { employeeByIdStore, employeeRefByAccountUuidStore } from '../../utils'

  export let value: Collaborator
  export let inline: boolean = false
  export let disabled: boolean = false
  export let accent: boolean = false
  export let maxWidth = ''
  export let avatarSize: IconSize = 'card'
  export let shouldShowAvatar = true

  const client = getClient()

  let person: Person | undefined = undefined

  $:void updatePerson(value, $employeeByIdStore, $employeeRefByAccountUuidStore)

  async function updatePerson (collaborator: Collaborator, employeeById: Map<Ref<Employee>, Employee>, employeeRefByAccountUuid: Map<AccountUuid, Ref<Employee>>): Promise<void> {
    const empRef = employeeRefByAccountUuid.get(collaborator.collaborator)

    if (empRef != null) {
      person = employeeById.get(empRef)
    }

    if (person == null) {
      person = await client.findOne(contact.class.Person, { personUuid: collaborator.collaborator })
    }
  }

</script>

{#if person}
  <ContactPresenter value={person} {inline} {disabled} {accent} {maxWidth} {avatarSize} {shouldShowAvatar}/>
  {/if}
