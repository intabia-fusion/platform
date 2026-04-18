<!--
// Copyright © 2024 Hardcore Engineering Inc.
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
  import { getCurrentAccount } from '@intabiafusion/core'
  import contact from '@intabiafusion/contact'
  import { DocUpdateMessage } from '@intabiafusion/activity'
  import notification from '@intabiafusion/notification'
  import { BaseMessagePreview } from '@intabiafusion/activity-resources'
  import { Action, Icon, Label } from '@intabiafusion/ui'

  export let message: DocUpdateMessage
  export let actions: Action[] = []

  $: attributeUpdates = message.attributeUpdates ?? { added: [], removed: [], set: [] }
  $: addedAttributes = (attributeUpdates.added.length > 0 ? attributeUpdates.added : attributeUpdates.set) ?? []
  $: isMeAdded = addedAttributes.includes(getCurrentAccount().uuid)
</script>

<BaseMessagePreview {actions} {message} on:click>
  <span class="overflow-label flex-presenter flex-gap-1-5">
    <Icon icon={contact.icon.Person} size="small" />
    <Label
      label={isMeAdded ? notification.string.YouAddedCollaborators : notification.string.YouRemovedCollaborators}
    />
  </span>
</BaseMessagePreview>
