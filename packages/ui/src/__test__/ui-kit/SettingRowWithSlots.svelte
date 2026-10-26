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
  import type { SettingRowProps } from '../../ui-kit/setting-row/types'
  import SettingRow from '../../ui-kit/setting-row/SettingRow.svelte'

  export let props: SettingRowProps
  export let details: boolean = false
</script>

<SettingRow {...props} let:labelId let:descriptionId let:controlId>
  <button class="control" type="button" id={controlId} aria-labelledby={labelId} aria-describedby={descriptionId}>
    Bug
  </button>
  <svelte:fragment slot="details">
    {#if details}<span class="chip">Epic</span>{/if}
  </svelte:fragment>
</SettingRow>
