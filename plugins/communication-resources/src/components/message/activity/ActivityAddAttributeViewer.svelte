<!--
// Copyright © 2025 Hardcore Engineering Inc.
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
  import { AttributeModel } from '@intabiafusion/view'
  import { ActivityAttributeUpdate } from '@intabiafusion/communication-types'
  import { IconEdit, Label } from '@intabiafusion/ui'

  import ActivityAttributeValue from './ActivityAttributeValue.svelte'
  import communication from '../../../plugin'

  export let model: AttributeModel
  export let value: ActivityAttributeUpdate['added']

  $: icon = IconEdit
</script>

<ActivityAttributeValue {model} {icon} values={value}>
  <svelte:fragment slot="text">
    <Label label={model.label} />
    <span class="lower"><Label label={communication.string.Added} />:</span>
  </svelte:fragment>
</ActivityAttributeValue>
