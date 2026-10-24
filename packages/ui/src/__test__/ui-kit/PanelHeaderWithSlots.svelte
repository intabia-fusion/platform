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
  import type { PanelHeaderProps } from '../../ui-kit/panel-header/types'
  import PanelHeader from '../../ui-kit/panel-header/PanelHeader.svelte'

  export let props: PanelHeaderProps
</script>

<PanelHeader {...props} on:close on:resize>
  <button slot="before" class="before" type="button">Back</button>
  <span class="title">Issues</span>
  <input slot="search" class="search" />
  <span slot="extra" class="extra">Filters</span>
  <button slot="actions" class="action" type="button">New</button>
</PanelHeader>
