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
  import { SystemAvatar } from '@hcengineering/contact-resources'
  import core, { type PersonId } from '@hcengineering/core'
  import { Label } from '@hcengineering/ui'
  import { PersonIdPresenter } from '@hcengineering/view-resources'

  /** A meeting recording is added by the system and shown like a person. */
  export let value: PersonId | undefined

  $: system = value == null || value === core.account.System
</script>

{#if system}
  <span class="system">
    <SystemAvatar size="card" />
    <span class="name"><Label label={core.string.System} /></span>
  </span>
{:else}
  <PersonIdPresenter {value} withPadding={false} noUnderline avatarSize="tiny" />
{/if}

<style lang="scss">
  .system {
    display: flex;
    align-items: center;
    gap: 0.375rem;
    min-width: 0;
  }

  .name {
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }
</style>
