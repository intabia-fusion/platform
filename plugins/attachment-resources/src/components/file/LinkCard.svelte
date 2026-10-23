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
  import type { BlobType, WithLookup } from '@hcengineering/core'
  import type { LinkPreviewAttachmentMetadata } from '@hcengineering/presentation'
  import { LinkCard, linkTarget } from '@hcengineering/ui/kit'

  import { createLinkDetails, removeLink, showLinkMenu } from './link'
  import { mayRemove, permissionsFor } from './permissions'

  export let value: WithLookup<Attachment> | BlobType
  export let removable: boolean = false

  const link = createLinkDetails()
  let menuOpen = false

  $: link.load(value)
  $: preview = value.metadata as LinkPreviewAttachmentMetadata | undefined
  $: permissions = permissionsFor(removable)
  $: canRemove = removable && mayRemove(value, $permissions)
</script>

<LinkCard
  {preview}
  details={$link.details}
  detailsLoaded={$link.loaded}
  highlighted={menuOpen}
  removable={canRemove}
  on:remove={() => removeLink(value)}
  on:contextmenu={(e) => {
    menuOpen = true
    showLinkMenu(e.detail, value, linkTarget(preview, $link.details).url, {
      removable: canRemove,
      onClose: () => (menuOpen = false)
    })
  }}
/>
