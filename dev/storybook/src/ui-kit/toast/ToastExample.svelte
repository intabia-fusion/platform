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
  import { getEmbeddedLabel } from '@hcengineering/platform'
  import { Toast, type ToastProps } from '@hcengineering/ui/kit'

  import Actions from './ToastActions.svelte'

  export let props: Partial<ToastProps> = {}
  export let title: ToastProps['title'] = getEmbeddedLabel('Export finished')
  export let content: string = ''
  export let withActions: boolean = false
</script>

<!-- A slot passed even empty counts as content, so each combination passes only the slots it fills. -->
{#if content !== '' && withActions}
  <Toast {title} {...props} {...$$restProps} on:close>
    {content}
    <svelte:fragment slot="actions"><Actions /></svelte:fragment>
  </Toast>
{:else if content !== ''}
  <Toast {title} {...props} {...$$restProps} on:close>{content}</Toast>
{:else if withActions}
  <Toast {title} {...props} {...$$restProps} on:close>
    <svelte:fragment slot="actions"><Actions /></svelte:fragment>
  </Toast>
{:else}
  <Toast {title} {...props} {...$$restProps} on:close />
{/if}
