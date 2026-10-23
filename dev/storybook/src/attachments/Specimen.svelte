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
  export let label: string
</script>

<figure class="specimen">
  <slot />
  <figcaption>{label}</figcaption>
</figure>

<style lang="scss">
  .specimen {
    display: flex;
    flex-direction: column;
    gap: 0.375rem;
    margin: 0;
    min-width: 0;
  }

  figcaption {
    font-size: 0.6875rem;
    color: var(--theme-dark-color);
  }
</style>
