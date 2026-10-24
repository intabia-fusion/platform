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
  import type { SectionProps } from '../../ui-kit/section/types'
  import Section from '../../ui-kit/section/Section.svelte'

  export let props: SectionProps
  export let withActions: boolean = true
</script>

<Section {...props}>
  <svelte:fragment slot="actions">
    {#if withActions}<button class="action" type="button">Add</button>{/if}
  </svelte:fragment>
  <p class="content">Members</p>
</Section>
