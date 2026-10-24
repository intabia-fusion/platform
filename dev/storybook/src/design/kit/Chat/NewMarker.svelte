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
  // Line that separates read messages from new ones
  export let label: string = 'New'
</script>

<div class="kit-new-marker">
  <div class="line" />
  <span class="label">{label}</span>
  <div class="line" />
</div>

<style lang="scss">
  .kit-new-marker {
    display: flex;
    align-items: center;
    flex-shrink: 0;
    width: 100%;
    height: 1rem;
    font-size: 0.75rem;
    color: var(--highlight-red);
  }
  .line {
    flex: 1;
    margin: 0 0.75rem 0 0;
    border-top: 1px dashed var(--highlight-red);

    &:last-child {
      margin: 0 0 0 0.75rem;
    }
  }
</style>
