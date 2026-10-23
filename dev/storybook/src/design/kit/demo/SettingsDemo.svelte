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
  import FormRow from '../Settings/FormRow.svelte'
  import SectionTitle from '../Settings/SectionTitle.svelte'
  import SettingsLayout from '../Settings/SettingsLayout.svelte'

  export let subtabs: string[] | undefined = undefined
</script>

<div style="width: 60rem; height: 24rem; border: 1px solid var(--theme-divider-color)">
  <SettingsLayout
    title="Project settings"
    back="Back to board"
    close
    tabs={[
      ['General', 'gear'],
      ['Members', 'users'],
      ['Boards', 'board']
    ]}
    tab="General"
    {subtabs}
    subtab={subtabs?.[0]}
  >
    <SectionTitle title="General" hint="Changes are saved immediately." />
    <FormRow label="Name"><Input value="Mobile app" size="wide" /></FormRow>
  </SettingsLayout>
</div>
