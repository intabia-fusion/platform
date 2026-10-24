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
  import ExampleAvatar from '../select-button/ExampleAvatar.svelte'

  // A row of custom markup: a label and the avatars of those who have seen the message.
  export let label: string
  export let people: string[] = []
</script>

<span class="seen">
  <span class="seen__label">{label}</span>
  <span class="seen__people">
    {#each people as initials, i}<ExampleAvatar {initials} color={i % 2 === 0 ? '#7b61ff' : '#d4588c'} />{/each}
  </span>
</span>

<style lang="scss">
  .seen {
    display: flex;
    flex-grow: 1;
    align-items: center;
    justify-content: space-between;
    gap: var(--spacing-1);
    font-size: 0.875rem;
  }
  .seen__people {
    display: flex;
    gap: var(--spacing-0_25);
  }
</style>
