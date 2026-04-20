<!--
// Copyright © 2024 Anticrm Platform Contributors.
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
  import contactPlugin, { getFirstName, getLastName } from '@hcengineering/contact'
  import { getMetadata } from '@hcengineering/platform'

  export let value: string | null | undefined = undefined
  export let name: string | null | undefined = undefined
  export let accent = false

  function getDisplayName (name: string | null | undefined): string {
    if (name == null) {
      return ''
    }

    const lastFirst = getMetadata(contactPlugin.metadata.LastNameFirst) === true
    const fname = getFirstName(name ?? '') ?? ''
    const lname = getLastName(name ?? '') ?? ''

    return lastFirst ? lname + ' ' + fname : fname + ' ' + lname
  }

  $: displayName = getDisplayName(value ?? name)
</script>

{#if accent}
  <span class="fs-bold">
    {displayName}
  </span>
{:else}
  {displayName}
{/if}
