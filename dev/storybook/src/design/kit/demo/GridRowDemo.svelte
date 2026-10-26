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
  import ClassicButton from '../Actions/ClassicButton.svelte'
  import EditBox from '../Forms/EditBox.svelte'
  import Toggle from '../Forms/Toggle.svelte'
  import GridRow from '../Settings/GridRow.svelte'
</script>

<div style="width: 34.375rem">
  <GridRow label="Project title" padded><EditBox kind="large-style" value="Mobile app" width={310} /></GridRow>
  <GridRow label="Default assignee"><ClassicButton size="large" icon="kit/PersonCircle" label="Assignee" /></GridRow>
  <GridRow label="Make private" hint="Only members can see it"><Toggle on={false} /></GridRow>
</div>
