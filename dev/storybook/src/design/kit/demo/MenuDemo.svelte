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
  // A popup as the app shows it: opened under the button that opens it
  import Button from '../Actions/Button.svelte'
  import Menu from '../Actions/Menu.svelte'
  import type { MenuEntry } from '../types'

  export let label: string = 'Open'
  export let items: MenuEntry[]
  export let width: number = 260
</script>

<div class="anchor">
  <Button kind="secondary" {label} menu pressed />
  <div class="popup"><Menu {items} {width} /></div>
</div>

<style>
  .anchor {
    position: relative;
    /* room for the absolutely positioned popup */
    width: 20rem;
    height: 15rem;
  }
  .popup {
    position: absolute;
    top: 2.5rem;
    left: 0;
  }
</style>
