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
  // Popup dialog: the product Modal with a title, content in the slot and Save / Cancel in the footer
  import { getEmbeddedLabel } from '@hcengineering/platform'
  import { Modal } from '@hcengineering/ui'

  export let title: string
  export let okLabel: string = 'Save'
</script>

<Modal
  type="type-popup"
  width="medium"
  label={getEmbeddedLabel(title.toUpperCase())}
  okLabel={getEmbeddedLabel(okLabel)}
  canSave
>
  <slot />
</Modal>
