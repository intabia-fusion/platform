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
  import { translateCB } from '@hcengineering/platform'
  import process, { type ExecutionError } from '@hcengineering/process'
  import { IconError, languageStore } from '@hcengineering/ui'
  import { IconButton } from '@hcengineering/ui/kit'

  import ErrorTooltip from './ErrorTooltip.svelte'

  export let value: ExecutionError[] | null | undefined

  // The tooltip is a component, so the button is named separately.
  let name = ''
  $: translateCB(process.string.Error, {}, $languageStore === '' ? undefined : $languageStore, (text) => {
    name = text
  })
</script>

{#if value}
  <IconButton
    icon={IconError}
    size="small"
    iconSize="medium"
    kind="tertiary"
    tooltip={{ component: ErrorTooltip, props: { value } }}
    aria-label={name}
    on:click
  />
{/if}
