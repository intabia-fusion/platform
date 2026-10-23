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
  import { AttachmentFormat, formatBadge, getAttachmentCategory } from '@hcengineering/attachment'
  import {
    AudioAttachment,
    AttachmentMiniPreview,
    AttachmentTile,
    FileCard,
    LinkCard,
    pageImage,
    VoiceAttachment
  } from '@hcengineering/attachment-resources'
  import { FileBadge, PageThumb } from '@hcengineering/ui/kit'

  import Board from './Board.svelte'
  import { createFixtures, createLinkFixtures, createLinkStateFixtures } from './fixtures'
  import Group from './Group.svelte'
  import Strip from './Strip.svelte'
  import Specimen from './Specimen.svelte'

  const f = createFixtures()
  const l = createLinkFixtures()
  const ls = createLinkStateFixtures()
  const links = [
    'article',
    'video',
    'tall',
    'square',
    'noImage',
    'noDescription',
    'titleIsHost',
    'noUrl',
    'noIcon',
    'brokenIcon',
    'brokenImage',
    'long',
    'metadataOnly'
  ]
  const formatOf = (value: any): AttachmentFormat => getAttachmentCategory(value.type, value.name).format
  const documents = ['pdf', 'docx', 'docxBare', 'xlsx', 'pptx', 'zip', 'apk', 'txt', 'longName']
  const tiles = ['image', 'video', 'pdf', 'docx', 'docxBare', 'zip', 'music', 'voice']
  const formats = Object.values(AttachmentFormat).filter((it) => it !== AttachmentFormat.LinkPreview)
</script>

<Board>
  <Group
    title="Message · documents (in use)"
    note="FileCard: the file card of the search without the author and the chat; the cover keeps its size before the page loads. The toolbar of the pictures shows on hover."
  >
    {#each documents as key}
      <Specimen label={key}><FileCard value={f[key]} /></Specimen>
    {/each}
  </Group>

  <Group
    title="Message · audio files"
    note="AudioAttachment: the player of the browser tab, one per chat, the waveform decoded when the card scrolls into view; a file over 4 MB plays on a bar."
  >
    <Specimen label="music"><AudioAttachment value={f.music} /></Specimen>
    <Specimen label="musicLarge"><AudioAttachment value={f.musicLarge} /></Specimen>
  </Group>

  <Group
    title="Message · voice messages"
    note="VoiceAttachment: the same player with the length known up front, the transcript under it; download and edit show on hover."
  >
    <Specimen label="done"><VoiceAttachment value={f.voice} /></Specimen>
    <Specimen label="pending"><VoiceAttachment value={f.voicePending} /></Specimen>
    <Specimen label="failed"><VoiceAttachment value={f.voiceFailed} /></Specimen>
  </Group>

  <Group
    title="Tiles"
    note="AttachmentTile for the composer and the descriptions: one height for all; a picture is a square, a file a small card, a recording plays in place. Remove shows on hover."
  >
    {#each tiles as key}
      <Specimen label={key}><AttachmentTile value={f[key]} removable /></Specimen>
    {/each}
  </Group>

  <Group
    title="Reply · quoted file"
    note="AttachmentMiniPreview next to the quote over the composer: a picture or a video frame, the first page, or the format badge."
  >
    {#each [...tiles, 'xlsx', 'txt'] as key}
      <Specimen label={key}><AttachmentMiniPreview value={f[key]} /></Specimen>
    {/each}
  </Group>

  <Group title="Composer · strip" direction="column">
    <Strip values={[f.image, f.pdf, f.zip, f.music, f.voice]} progress />
  </Group>

  <Group title="Issue description · attachments" direction="column">
    <Strip kind="description" values={[f.image, f.imageTall, f.pdf, f.docx, f.zip, f.music]} />
  </Group>

  <Group
    title="Message · links"
    note="LinkCard: a wide picture leads the card at a fixed ratio, a small or tall one sits beside the text, no picture - text only. The layout comes from the metadata, so the card has its size before anything loads. A click opens the link; open, copy and remove are in the right-click menu."
  >
    {#each links as key}
      <Specimen label={key}><LinkCard value={l[key]} /></Specimen>
    {/each}
  </Group>

  <Group
    title="Message · a link while it loads and when it fails"
    note="One link in every outcome, side by side: the card has the same height in each. The picture and the text come from the attachment, so they size the card up front; the site row fills in, a picture that fails leaves its box with a globe."
  >
    <Specimen label="loaded"><LinkCard value={ls.loaded} /></Specimen>
    <Specimen label="details loading"><LinkCard value={ls.detailsLoading} /></Specimen>
    <Specimen label="picture loading"><LinkCard value={ls.pictureLoading} /></Specimen>
    <Specimen label="details failed"><LinkCard value={ls.detailsFailed} /></Specimen>
    <Specimen label="picture failed"><LinkCard value={ls.pictureFailed} /></Specimen>
  </Group>

  <Group
    title="Message · a small picture while it loads"
    note="Beside the text, the same square while loading and after."
  >
    <Specimen label="loaded"><LinkCard value={l.square} /></Specimen>
    <Specimen label="picture loading"><LinkCard value={ls.thumbLoading} /></Specimen>
  </Group>

  <Group
    title="Message · an attachment without metadata"
    note="Older previews keep the text only in the file: the card reserves a title line and two of description, so it keeps one height loading, loaded and failed."
  >
    <Specimen label="loading"><LinkCard value={ls.noMetadataLoading} /></Specimen>
    <Specimen label="loaded"><LinkCard value={ls.noMetadataLoaded} /></Specimen>
    <Specimen label="failed · address kept"><LinkCard value={ls.addressOnlyFailed} /></Specimen>
    <Specimen label="failed · nothing kept (older)"><LinkCard value={ls.noMetadataFailed} /></Specimen>
  </Group>

  <Group
    title="Link tiles · loading and failures"
    note="The tile has one size anyway; the site fills in, with only the address kept the site is the title and the address the line under it; an older preview with nothing kept says it is unavailable."
  >
    <Specimen label="loaded"><AttachmentTile value={ls.loaded} removable /></Specimen>
    <Specimen label="details loading"><AttachmentTile value={ls.detailsLoading} removable /></Specimen>
    <Specimen label="picture loading"><AttachmentTile value={ls.pictureLoading} removable /></Specimen>
    <Specimen label="details failed"><AttachmentTile value={ls.detailsFailed} removable /></Specimen>
    <Specimen label="picture failed"><AttachmentTile value={ls.pictureFailed} removable /></Specimen>
    <Specimen label="no metadata · loading"><AttachmentTile value={ls.noMetadataLoading} removable /></Specimen>
    <Specimen label="address only · failed"><AttachmentTile value={ls.addressOnlyFailed} removable /></Specimen>
    <Specimen label="no metadata · failed"><AttachmentTile value={ls.noMetadataFailed} removable /></Specimen>
  </Group>

  <Group
    title="Link tiles"
    note="AttachmentTile of a link for the composer and the descriptions: the file tile of kind link; the page's picture or the site's icon, the title and the site."
  >
    {#each ['article', 'noImage', 'noIcon', 'brokenIcon', 'long', 'metadataOnly'] as key}
      <Specimen label={key}><AttachmentTile value={l[key]} removable /></Specimen>
    {/each}
  </Group>

  <Group title="Composer · files and links" direction="column">
    <Strip values={[f.image, f.pdf, l.article, l.noImage, f.music]} />
  </Group>

  <Group title="Viewer · title badges" note="The header of the viewer shows the format badge next to the name.">
    <Specimen label="title badges">
      <div style:display="flex" style:gap="0.5rem">
        {#each ['pdf', 'docx', 'zip', 'music'] as key}<FileBadge
            {...formatBadge(formatOf(f[key]), f[key].name)}
            variant="title"
          />{/each}
      </div>
    </Specimen>
  </Group>

  <Group title="Parts · format badges">
    {#each formats as format}
      <Specimen label={format}><FileBadge {...formatBadge(format, '')} /></Specimen>
    {/each}
  </Group>

  <Group title="Parts · page previews">
    <Specimen label="page">
      <PageThumb
        badge={formatBadge(AttachmentFormat.Pdf, f.pdf.name)}
        page={pageImage(AttachmentFormat.Pdf, f.pdf.file, f.pdf.name)}
        cacheKey={f.pdf.file}
      />
    </Specimen>
    <Specimen label="no preview">
      <PageThumb
        badge={formatBadge(AttachmentFormat.Archive, f.zip.name)}
        page={pageImage(AttachmentFormat.Archive, f.zip.file, f.zip.name)}
        cacheKey={f.zip.file}
      />
    </Specimen>
  </Group>
</Board>
