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
  import { Person } from '@hcengineering/contact'
  import { Avatar } from '@hcengineering/contact-resources'
  import { ModernButton } from '@hcengineering/ui'
  import { getEmbeddedLabel } from '@hcengineering/platform'
  import love from '../../../plugin'

  export let person: Person
  export let onClick: (e: MouseEvent, person: Person) => void
</script>

<ModernButton
  label={love.string.WaitingForMeeting}
  kind="primary"
  size="small"
  tooltip={{ label: getEmbeddedLabel(`Waiting for ${person.name} to start the meeting`), direction: 'bottom' }}
  dataId="awaiting-meeting-trigger"
  on:click={(e) => {
    onClick(e, person)
  }}
>
  <div class="avatars-container">
    <div class="combined-avatar tiny">
      <Avatar name={person.name} size={'card'} {person} />
    </div>
  </div>
</ModernButton>

<style lang="scss">
  .avatars-container {
    display: flex;
    flex-direction: row-reverse;
    align-items: center;
    margin-left: 0.5rem;
  }
  .combined-avatar {
    position: relative;
    margin-left: -0.5rem;
    &:first-child {
      margin-left: 0;
    }
    &.tiny {
      width: 1.5rem;
      height: 1.5rem;
    }
  }
</style>
