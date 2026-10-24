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
  import Input from '../Forms/Input.svelte'
  import Toggle from '../Forms/Toggle.svelte'
  import FormRow from '../Settings/FormRow.svelte'
</script>

<div style="display: flex; flex-direction: column; gap: 1rem; width: 44rem">
  <FormRow label="Name"><Input value="Mobile app" size="wide" /></FormRow>
  <FormRow label="Identifier" hint="Prefix of issue numbers: APP-6"><Input value="APP" size="narrow" /></FormRow>
  <FormRow label="Private project" hint="Visible to members only"><Toggle on={false} /></FormRow>
</div>
