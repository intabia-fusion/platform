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
  import { NavItem } from '@hcengineering/ui/kit'

  export let width: string = '14rem'
</script>

<!-- A navigator-width box: a row stretches to it, as in the panel. -->
<div class="nav-item-frame" style:width>
  <NavItem {...$$restProps} label={$$restProps.label} />
</div>

<style lang="scss">
  .nav-item-frame {
    display: flex;
    flex-direction: column;
    padding: var(--spacing-0_5);
    background-color: var(--theme-navpanel-color);
    border-radius: var(--small-BorderRadius);
  }
</style>
