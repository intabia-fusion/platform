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
  // Header of a content panel: the product Header with a breadcrumb title and right-side actions
  import { Breadcrumbs, Header } from '@hcengineering/ui'
  import { productIcon } from '../productIcon'
  import type { IconName } from '../types'

  export let title: string
  export let icon: IconName | undefined = undefined
  // A divider before the actions
  export let divided: boolean = false

  $: asset = productIcon(icon)
  $: items = [{ icon: asset, title }]
</script>

{#if $$slots.actions && divided}
  <Header adaptive="disabled" hideBefore>
    <Breadcrumbs {items} currentOnly />
    <svelte:fragment slot="search" />
    <svelte:fragment slot="actions"><slot name="actions" /></svelte:fragment>
  </Header>
{:else if $$slots.actions}
  <Header adaptive="disabled" hideBefore>
    <Breadcrumbs {items} currentOnly />
    <svelte:fragment slot="actions"><slot name="actions" /></svelte:fragment>
  </Header>
{:else}
  <Header adaptive="disabled" hideBefore>
    <Breadcrumbs {items} currentOnly />
  </Header>
{/if}
