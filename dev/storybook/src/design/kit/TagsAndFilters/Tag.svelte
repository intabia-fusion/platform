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
  import { themeStore } from '@hcengineering/ui'
  import { paletteDef } from '../palette'
  import type { Label } from '../types'

  export let label: Label

  $: color = paletteDef(label[1], $themeStore.dark).color
</script>

<span class="kit-tag"><i style:background-color={color} />{label[0]}</span>

<style>
  .kit-tag {
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
    box-sizing: border-box;
    height: 1.25rem;
    padding: 0 0.375rem;
    font-size: 0.6875rem;
    color: var(--theme-content-color);
    border: 1px solid var(--theme-button-border);
    border-radius: 0.625rem;
  }
  i {
    width: 0.5rem;
    height: 0.5rem;
    border-radius: 50%;
  }
</style>
