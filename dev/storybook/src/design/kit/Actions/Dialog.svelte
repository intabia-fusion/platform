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
  // The product Dialog as an inline card; width in px snaps to the closest named width of the Dialog
  import { getEmbeddedLabel } from '@hcengineering/platform'
  import { Dialog } from '@hcengineering/ui/kit'
  import type { DialogSubmitKind } from '@hcengineering/ui/kit'
  import { dialogWidth } from './dialogWidth'

  export let title: string
  export let width: number | undefined = undefined
  export let submitLabel: string | undefined = undefined
  export let cancelLabel: string | undefined = undefined
  export let submitKind: DialogSubmitKind | undefined = undefined
  export let canSubmit: boolean | undefined = undefined
  export let footer: boolean | undefined = undefined
</script>

<Dialog
  label={getEmbeddedLabel(title)}
  width={dialogWidth(width)}
  {submitKind}
  {canSubmit}
  {footer}
  submitLabel={submitLabel !== undefined ? getEmbeddedLabel(submitLabel) : undefined}
  cancelLabel={cancelLabel !== undefined ? getEmbeddedLabel(cancelLabel) : undefined}
>
  <slot />
</Dialog>
