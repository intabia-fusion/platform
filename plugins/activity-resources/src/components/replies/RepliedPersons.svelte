<!-- Copyright © 2025 Hardcore Engineering Inc. -->
<!-- -->
<!-- Licensed under the Eclipse Public License, Version 2.0 (the "License"); -->
<!-- you may not use this file except in compliance with the License. You may -->
<!-- obtain a copy of the License at https://www.eclipse.org/legal/epl-2.0 -->
<!-- -->
<!-- Unless required by applicable law or agreed to in writing, software -->
<!-- distributed under the License is distributed on an "AS IS" BASIS, -->
<!-- WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. -->
<!-- -->
<!-- See the License for the specific language governing permissions and -->
<!-- limitations under the License. -->

<script lang="ts">
  import { notEmpty, Ref } from '@hcengineering/core'
  import { Avatar, getPersonByPersonRefStore } from '@hcengineering/contact-resources'
  import { Person } from '@hcengineering/contact'

  export let repliedPersons: Ref<Person>[] = []

  const displayPersonsNumber = 5

  let displayPersons: Person[] = []

  $: persons = new Set(repliedPersons)

  $: personByRefStore = getPersonByPersonRefStore(Array.from(persons))
  $: personById = $personByRefStore
  $: allPersons = Array.from(persons)
    .map((id) => personById.get(id))
    .filter(notEmpty)
  $: displayPersons = allPersons.slice(0, displayPersonsNumber - 1)

  $: count = allPersons.length
</script>

{#if displayPersons.length > 0}
  <div class="thread__avatars">
    {#each displayPersons as person}
      <Avatar size="x-small" {person} name={person.name} />
    {/each}
  </div>

  {#if count > displayPersonsNumber}
    +{count - displayPersonsNumber}
  {/if}
{/if}

<style lang="scss">
  .thread__avatars {
    display: flex;
    gap: 0.25rem;
  }
</style>
