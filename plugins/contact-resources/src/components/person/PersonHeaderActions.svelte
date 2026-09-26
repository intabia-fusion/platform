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
  import { getCurrentEmployee } from '@hcengineering/contact'
  import { type Doc } from '@hcengineering/core'
  import { ComponentExtensions, getClient } from '@hcengineering/presentation'

  import contact from '../../plugin'

  // Header extension passes the edited object as `value`.
  export let value: Doc | undefined

  const h = getClient().getHierarchy()

  $: canContact =
    value !== undefined &&
    value._id !== getCurrentEmployee() &&
    h.hasMixin(value, contact.mixin.Employee) &&
    h.as(value, contact.mixin.Employee).active
</script>

{#if canContact}
  <div class="flex-row-center flex-gap-2">
    <ComponentExtensions
      extension={contact.extension.EmployeePopupActions}
      props={{ employee: value, icon: contact.icon.Chat, type: 'type-button-icon' }}
    />
  </div>
{/if}
