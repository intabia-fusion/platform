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
  import type { PreviewSnapshot } from '@hcengineering/core'
  import type { Asset } from '@hcengineering/platform'
  import { getClient } from '@hcengineering/presentation'
  import type { IconSize } from '@hcengineering/ui'
  import { Icon } from '@hcengineering/ui'

  import { getPreviewIcon, type PreviewIcon } from '../preview'

  export let value: PreviewSnapshot
  export let size: IconSize = 'small'
  // Drawn while the icon loads and when the preview has none
  export let fallback: Asset | undefined = undefined

  const client = getClient()

  let data: PreviewIcon | undefined
  let asked: PreviewSnapshot | undefined

  $: void load(value)

  async function load (preview: PreviewSnapshot): Promise<void> {
    // A list hands over a fresh copy on every update: new props would make the icon component ask again
    if (asked?.objectId === preview.objectId && asked.modifiedOn === preview.modifiedOn) return
    asked = preview
    const res = await getPreviewIcon(client, preview)
    // A late answer for a preview no longer shown is dropped
    if (asked === preview) data = res
  }
</script>

{#if data?.icon != null}
  <Icon icon={data.icon} iconProps={data.iconProps} {size} />
{:else if fallback != null}
  <Icon icon={fallback} {size} />
{/if}
