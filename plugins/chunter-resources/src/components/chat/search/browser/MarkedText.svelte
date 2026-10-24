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
  import { splitHighlight } from '../../../../search/highlight'

  export let text: string
</script>

{#each splitHighlight(text) as part}{#if part.marked}<mark>{part.text}</mark>{:else}{part.text}{/if}{/each}

<style lang="scss">
  mark {
    background-color: var(--tag-nuance-SunshineBackground);
    color: inherit;
    border-radius: 0.1875rem;
    padding: 0.0625rem 0.125rem;
    margin: -0.0625rem -0.125rem;
  }
</style>
