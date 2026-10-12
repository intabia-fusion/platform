<!--
// Copyright © 2023 Hardcore Engineering Inc.
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
  import ui, { Label } from '@hcengineering/ui'
  import type { Filter } from '@hcengineering/view'

  export let value: Filter['value']
  $: first = Array.isArray(value[0]) ? value[0][0] : value[0]
  $: text = first == null ? '' : value.length > 1 ? `${first}, +${value.length - 1}` : `${first}`
</script>

{#if value.length > 0}
  {#if first == null}
    <Label label={ui.string.NotSelected} />{#if value.length > 1}{`, +${value.length - 1}`}{/if}
  {:else}
    {text}
  {/if}
{/if}
