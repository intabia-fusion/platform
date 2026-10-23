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
  import {
    AttachmentFormat,
    AttachmentKind,
    formatBadge,
    getAttachmentCategory,
    type Attachment
  } from '@hcengineering/attachment'
  import type { IntlString } from '@hcengineering/platform'
  import type { BlobType, WithLookup } from '@hcengineering/core'
  import { getClient, getFileUrl, type LinkPreviewAttachmentMetadata } from '@hcengineering/presentation'
  import { FileTile, type ImageSource } from '@hcengineering/ui/kit'
  import { createEventDispatcher } from 'svelte'

  import attachmentRes from '../../plugin'
  import { isVoiceAttachment, showAttachmentPreviewPopup } from '../../utils'
  import { blobImage, pageImage } from './blob'
  import { createLinkDetails } from './link'
  import { confirmRemove } from './menu'
  import { mayRemove, permissionsFor } from './permissions'

  export let value: WithLookup<Attachment> | BlobType
  export let removable: boolean = false
  /** Not a doc yet: the author's to remove, whatever the space forbids. */
  export let draft: boolean = false
  /** `large` where there is room for the name (description, activity). */
  export let scale: 'medium' | 'large' = 'medium'
  export let upload: { progress: number, failed?: IntlString, retryable: boolean } | undefined = undefined
  /** The picture from the user's disk: kept after the upload, so the tile does not load it again. */
  export let local: string | undefined = undefined

  const dispatch = createEventDispatcher()
  const hierarchy = getClient().getHierarchy()

  const linkDetails = createLinkDetails()

  $: voice = isVoiceAttachment(hierarchy, value)
  $: category = getAttachmentCategory(value.type, value.name, voice)
  $: link = category.format === AttachmentFormat.LinkPreview
  let kind: 'picture' | 'video' | 'audio' | 'file' | 'link'
  $: kind = link
    ? 'link'
    : category.format === AttachmentFormat.Video
      ? 'video'
      : category.kind === AttachmentKind.Media
        ? 'picture'
        : category.kind === AttachmentKind.Audio
          ? 'audio'
          : 'file'
  $: duration = (value as { durationSec?: number }).durationSec
  $: permissions = permissionsFor(removable)
  $: canRemove = removable && (upload != null || draft || mayRemove(value, $permissions))
  $: stored = upload == null && value.file !== ''
  let picture: ImageSource | undefined
  $: picture =
    kind !== 'picture' && kind !== 'video'
      ? undefined
      : local != null
        ? localImage(local)
        : stored
          ? blobImage(value.file, value.name)
          : undefined

  function localImage (src: string): ImageSource {
    return async () => ({ src })
  }

  function open (): void {
    showAttachmentPreviewPopup(value)
  }

  // The list owner removes; the tile only confirms a file was meant. A link loses only its card.
  function remove (): void {
    if (link || upload != null) {
      dispatch('remove', value)
      return
    }
    confirmRemove(async () => {
      dispatch('remove', value)
    })
  }

  let linkPreview: LinkPreviewAttachmentMetadata | undefined
  $: linkPreview = link ? (value.metadata as LinkPreviewAttachmentMetadata | undefined) : undefined
  $: if (link) linkDetails.load(value)
</script>

{#if link}
  <FileTile
    kind="link"
    {scale}
    preview={linkPreview}
    details={$linkDetails.details}
    detailsLoaded={$linkDetails.loaded}
    removable={canRemove}
    on:remove={remove}
  />
{:else}
  <FileTile
    {kind}
    {scale}
    name={value.name}
    nameLabel={voice ? attachmentRes.string.VoiceMessage : undefined}
    size={value.size}
    badge={formatBadge(category.format, value.name)}
    {picture}
    page={stored ? pageImage(category.format, value.file, value.name) : undefined}
    cacheKey={local ?? (stored ? value.file : undefined)}
    playbackId={value.file}
    url={stored ? getFileUrl(value.file, value.name) : ''}
    {duration}
    progress={upload?.failed == null ? upload?.progress : undefined}
    failed={upload?.failed}
    retryable={upload?.retryable ?? false}
    removable={canRemove}
    on:open={open}
    on:remove={remove}
    on:retry
  />
{/if}
