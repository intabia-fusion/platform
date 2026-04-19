<!--
// Copyright © 2023 Hardcore Engineering Inc.
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
  import { ActivityMessagePresenter } from '@hcengineering/activity-resources'
  import { ChatMessage } from '@hcengineering/chunter'

  export let value: ChatMessage
</script>

<div class="delete-message-presenter">
  <ActivityMessagePresenter {value} readonly withActions={false} hoverable={false} padding="1rem" />
</div>

<style lang="scss">
  .delete-message-presenter {
    display: flex;
    flex-direction: column;
    border: 1px solid var(--global-ui-BorderColor);
    border-radius: 0.25rem;
  }
</style>
