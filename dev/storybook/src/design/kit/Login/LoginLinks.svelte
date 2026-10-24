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
  // Rows under the button: a caption and a link, centered; accent: left, blue links (workspace list)
  // [caption, link]
  export let rows: Array<[string | undefined, string]>
  export let accent: boolean = false
  export let width: number = 396
</script>

<div class="login-links" class:accent style:width="{width}px">
  {#each rows as [caption, link]}
    <div class="row">
      {#if caption !== undefined && caption !== ''}<span class="caption">{caption}</span>{/if}
      <span class="link">{link}</span>
    </div>
  {/each}
</div>

<style lang="scss">
  .login-links {
    flex: none;
    font-size: 12.8px;
    line-height: 1.3;
    color: #333333;
  }
  .row {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    column-gap: 3.2px;
  }
  .accent {
    .row {
      justify-content: flex-start;
    }
    .caption {
      color: #000061;
      opacity: 0.8;
    }
    .link {
      color: #6e48ce;
      opacity: 0.8;
    }
  }
</style>
