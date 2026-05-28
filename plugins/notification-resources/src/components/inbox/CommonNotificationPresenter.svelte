<!--
// Copyright © 2026 Intabia Fusion.
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
  import { BasePreview } from '@hcengineering/activity-resources'
  import { Markup } from '@hcengineering/core'
  import { IntlString, translateCB } from '@hcengineering/platform'
  import { themeStore } from '@hcengineering/ui'
  import { CommonNotification } from '@hcengineering/notification'

  export let value: CommonNotification

  let markup: Markup = ''

  $: void updateContent(value.messageIntl, value.markup)

  async function updateContent (_messageIntl?: IntlString, _markup?: Markup): Promise<void> {
    if (_markup !== undefined) {
      markup = _markup
    } else if (_messageIntl !== undefined) {
      translateCB(_messageIntl, {}, $themeStore.language, (res) => {
        markup = res
      })
    }
  }
</script>

<BasePreview
  headerIcon={value.header?.icon}
  header={value.header?.titleIntl}
  headerObjectClass={value.header?.objectClass}
  headerObjectId={value.header?.objectId}
  text={markup}
  account={value.createdBy}
  timestamp={value.createdOn}
  on:click
/>
