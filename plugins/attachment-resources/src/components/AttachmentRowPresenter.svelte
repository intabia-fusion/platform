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
  import type { Attachment } from '@hcengineering/attachment'
  import { AccountRole, getCurrentAccount } from '@hcengineering/core'

  import { mySocialStringsStore } from '../stores'
  import AttachmentLabel from './file/AttachmentLabel.svelte'

  export let value: Attachment | undefined

  const me = getCurrentAccount()

  $: isOwn =
    value?.createdBy !== undefined &&
    $mySocialStringsStore !== undefined &&
    (me.role === AccountRole.Owner || $mySocialStringsStore.has(value.createdBy))
</script>

<!-- Delete is in the menu of a right click, with a confirmation. -->
<AttachmentLabel {value} removable={isOwn} />
