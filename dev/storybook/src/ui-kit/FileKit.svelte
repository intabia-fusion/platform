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
    FileBadge,
    FileCard,
    FileCover,
    FileNoPreview,
    FileTile,
    IconButton,
    IconFileDownload,
    MediaToolbar,
    PageThumb,
    type FileBadgeData,
    type ImageSource
  } from '@hcengineering/ui/kit'
  import ui, { IconOpen } from '@hcengineering/ui'
  import { onDestroy } from 'svelte'

  import { hanging, page, pdf, photo, speech } from '../attachments/fixtures'
  import Group from '../attachments/Group.svelte'
  import Specimen from '../attachments/Specimen.svelte'
  import Board from './Board.svelte'
  import { article, textOnly } from './links'

  const image =
    (src: string): ImageSource =>
      async () => ({ src })

  const badges: Record<string, FileBadgeData> = {
    pdf: { label: 'PDF', color: 'Firework' },
    docx: { label: 'DOCX', color: 'Cerulean' },
    xlsx: { label: 'XLSX', color: 'Houseplant' },
    pptx: { label: 'PPTX', color: 'Orange' },
    zip: { label: 'ZIP', color: 'Sunshine' },
    jpg: { label: 'JPG', color: 'Sky' },
    mp4: { label: 'MP4', color: 'Blueberry' },
    mp3: { label: 'MP3', color: 'Pink' },
    voice: { label: 'VOICE', color: 'Orchid' },
    bin: { label: 'BIN' }
  }

  const report = image(page('Q3 report', '#e5484d'))
  const sheet = image(page('Budget', '#30a46c', true))
  const sunset = image(photo(1600, 1000, '#9fc6e8', '#3d5a40', '#ffd27a'))
  const BLURHASH = 'UIQ]+y?Ixu-;?Ij[%Lay%MRjWUof~qRkayt7'
  const media = photo(800, 500, '#f2b48c', '#7a4a3a', '#fff1d6')
  const mediaLight = photo(800, 500, '#f4f6fa', '#d9dee8', '#ffffff')
  const pdfUrl = pdf('Q3 report')

  let moving = 0.1
  const timer = setInterval(() => {
    moving = moving >= 1 ? 0.1 : Math.min(1, moving + 0.15)
  }, 600)
  onDestroy(() => {
    clearInterval(timer)
  })
  const music = speech(12, 3)
</script>

<Board>
  <Group title="FileBadge" note="The extension on the colour of its kind; without a colour, a neutral tint.">
    {#each Object.entries(badges) as [key, badge]}
      <Specimen label={key}><FileBadge {...badge} /></Specimen>
    {/each}
    <Specimen label="title"><div class="fit"><FileBadge {...badges.pdf} variant="title" /></div></Specimen>
    <Specimen label="no label"><FileBadge /></Specimen>
    <Specimen label="no label · large"><FileBadge variant="large" /></Specimen>
    <Specimen label="no label · mini"><div class="fit"><FileBadge variant="mini" /></div></Specimen>
  </Group>

  <Group title="PageThumb · FileCover" note="The first page when there is one, the badge otherwise.">
    <Specimen label="page"><div class="thumb"><PageThumb badge={badges.pdf} page={report} /></div></Specimen>
    <Specimen label="no page"><div class="thumb"><PageThumb badge={badges.zip} /></div></Specimen>
    <Specimen label="cover · picture"
      ><div class="cover"><FileCover badge={badges.jpg} picture={sunset} /></div></Specimen
    >
    <Specimen label="cover · picture loading, blurhash"
      ><div class="cover">
        <FileCover badge={badges.jpg} picture={image(hanging('sunset.jpg'))} blurhash={BLURHASH} />
      </div></Specimen
    >
    <Specimen label="cover · page"><div class="cover"><FileCover badge={badges.xlsx} page={sheet} /></div></Specimen>
    <Specimen label="cover · badge"><div class="cover"><FileCover badge={badges.bin} /></div></Specimen>
  </Group>

  <Group title="FileCard" note="A document in a message: the page, the name and the size.">
    <FileCard
      name="Q3 report.pdf"
      size={1_240_000}
      badge={badges.pdf}
      page={report}
      url={pdfUrl}
      contentType="application/pdf"
    />
    <FileCard name="Budget 2027.xlsx" size={86_000} badge={badges.xlsx} page={sheet} url="" />
    <FileCard
      name="Archive with a very long name that does not fit on one line.zip"
      size={48_000_000}
      badge={badges.zip}
      url=""
    />
    <FileCard name="Highlighted.pdf" size={1_240_000} badge={badges.pdf} page={report} url={pdfUrl} highlighted />
  </Group>

  <Group title="FileTile" note="The composer and the description: one height for every kind.">
    <FileTile kind="picture" name="Sunset.jpg" badge={badges.jpg} picture={sunset} removable />
    <FileTile kind="video" name="Demo.mp4" badge={badges.mp4} picture={sunset} />
    <FileTile
      kind="audio"
      name="Morning ambient loop.mp3"
      size={2_100_000}
      badge={badges.mp3}
      playbackId="kit-tile-music"
      url={music}
      duration={12}
      removable
    />
    <FileTile kind="file" name="Q3 report.pdf" size={1_240_000} badge={badges.pdf} page={report} removable />
    <FileTile kind="file" name="Archive.zip" size={48_000_000} badge={badges.zip} />
    <FileTile
      kind="picture"
      name="Broken.jpg"
      size={820_000}
      badge={badges.jpg}
      picture={image(hanging('kit-broken'))}
    />
    <FileTile loading />
    <FileTile loading removable />
  </Group>

  <Group
    title="FileTile · upload"
    note="A file on its way keeps its place: the bar fills, the tile becomes the stored file in place. A failure stays on the tile, with a retry when one can help."
  >
    <FileTile
      kind="picture"
      name="Sunset.jpg"
      size={8_200_000}
      badge={badges.jpg}
      picture={sunset}
      progress={moving}
      removable
    />
    <FileTile kind="file" name="Q3 report.pdf" size={1_240_000} badge={badges.pdf} progress={0.7} removable />
    <FileTile kind="file" name="Archive.zip" size={48_000_000} badge={badges.zip} progress={0} removable />
    <FileTile
      kind="file"
      name="Archive.zip"
      size={48_000_000}
      badge={badges.zip}
      failed={ui.string.UploadFailed}
      retryable
      removable
    />
    <FileTile
      kind="picture"
      name="Sunset.jpg"
      size={8_200_000}
      badge={badges.jpg}
      picture={sunset}
      failed={ui.string.UploadFailed}
      removable
    />
  </Group>

  <Group
    title="FileTile · large · states"
    note="The same tile on its own: a taller page and the name on two lines. At rest, removable, loading."
  >
    <FileTile scale="large" name="Q3 report.pdf" size={1_240_000} badge={badges.pdf} page={report} url={pdfUrl} />
    <FileTile
      scale="large"
      name="Quarterly results with a long name that runs on to a second line.docx"
      size={24_000}
      badge={badges.docx}
      url={pdfUrl}
    />
    <FileTile scale="large" kind="picture" name="Sunset.jpg" size={820_000} badge={badges.jpg} picture={sunset} />
    <FileTile
      scale="large"
      name="Budget 2027.xlsx"
      size={86_000}
      badge={badges.xlsx}
      page={sheet}
      url={pdfUrl}
      removable
    />
    <FileTile scale="large" loading removable />
  </Group>

  <Group
    title="FileTile · link"
    note="A link among the files: the page's picture or the site's icon, the title and the site; a click opens it."
  >
    <FileTile kind="link" preview={article.preview} details={article.details} detailsLoaded removable />
    <FileTile kind="link" preview={textOnly.preview} details={textOnly.details} detailsLoaded />
    <FileTile kind="link" />
    <FileTile kind="link" preview={{ url: 'https://docs.example.com/releases/2026-10' }} detailsLoaded />
    <FileTile kind="link" detailsLoaded />
  </Group>

  <Group
    title="MediaToolbar"
    note="Ghost buttons on a floating panel in the corner of a picture or a video; it shows while the media is hovered. A picture keeps only Download, a video Open and Download; the rest is in the right-click menu."
  >
    {#each [media, mediaLight] as src}
      <Specimen label="picture">
        <div class="media">
          <img {src} alt="" />
          <MediaToolbar visible>
            <IconButton icon={IconFileDownload} kind="ghost" size="small" iconSize="small" aria-label="Download" />
          </MediaToolbar>
        </div>
      </Specimen>
    {/each}
    <Specimen label="video">
      <div class="media">
        <img src={media} alt="" />
        <MediaToolbar visible>
          <IconButton icon={IconOpen} kind="ghost" size="small" iconSize="small" aria-label="Open" />
          <IconButton icon={IconFileDownload} kind="ghost" size="small" iconSize="small" aria-label="Download" />
        </MediaToolbar>
      </div>
    </Specimen>
  </Group>

  <Group title="FileNoPreview">
    <Specimen label="no preview">
      <div class="no-preview"><FileNoPreview name="Archive.zip" badge={badges.zip} url="#" /></div>
    </Specimen>
    <Specimen label="failed">
      <div class="no-preview">
        <FileNoPreview name="Server.log" badge={badges.bin} url="#" label={ui.string.PreviewFailed} />
      </div>
    </Specimen>
    <Specimen label="no address">
      <div class="no-preview">
        <FileNoPreview name="Server.log" badge={badges.bin} url="" label={ui.string.PreviewFailed} />
      </div>
    </Specimen>
  </Group>
</Board>

<style lang="scss">
  // A badge sized by its text: the specimen's column would stretch it to the caption.
  .fit {
    display: flex;
  }

  .thumb {
    --page-thumb-width: 3rem;
    --page-thumb-height: 3.75rem;
  }

  .cover {
    width: 12rem;
    height: 8rem;
  }

  .media {
    position: relative;
    width: 18rem;
    border-radius: var(--small-BorderRadius);
    overflow: hidden;

    img {
      display: block;
      width: 100%;
    }
  }

  .no-preview {
    width: 28rem;
  }
</style>
