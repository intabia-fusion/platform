//
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
//

// Object URLs carry "://", so the components use them as is, bypassing the storage.

function objectUrl (data: BlobPart, type: string): string {
  return URL.createObjectURL(new Blob([data], { type }))
}

function svg (width: number, height: number, body: string): string {
  return objectUrl(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${body}</svg>`,
    'image/svg+xml'
  )
}

export function page (title: string, accent: string, table = false): string {
  const lines = Array.from({ length: 14 }, (_, i) => {
    const y = 150 + i * 22
    const w = 360 - ((i * 37) % 120)
    return `<rect x="40" y="${y}" width="${w}" height="8" rx="4" fill="#d5d8de"/>`
  }).join('')
  const grid = Array.from({ length: 9 }, (_, r) =>
    Array.from(
      { length: 4 },
      (_, c) =>
        `<rect x="${40 + c * 92}" y="${150 + r * 30}" width="86" height="24" fill="${r === 0 ? accent : '#eef0f3'}" opacity="${r === 0 ? 0.8 : 1}"/>`
    ).join('')
  ).join('')
  return svg(
    480,
    680,
    `<rect width="480" height="680" fill="#fff"/><rect x="40" y="48" width="64" height="8" rx="4" fill="${accent}"/><text x="40" y="100" font-family="Helvetica, Arial" font-size="28" font-weight="700" fill="#1f2328">${title}</text>${table ? grid : lines}`
  )
}

export function photo (width: number, height: number, sky: string, ground: string, sun: string): string {
  return svg(
    width,
    height,
    `<defs><linearGradient id="s" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${sky}"/><stop offset="1" stop-color="#fde2c4"/></linearGradient></defs><rect width="${width}" height="${height}" fill="url(#s)"/><circle cx="${width * 0.7}" cy="${height * 0.42}" r="${height * 0.12}" fill="${sun}"/><path d="M0 ${height * 0.7} L${width * 0.25} ${height * 0.45} L${width * 0.5} ${height * 0.68} L${width * 0.72} ${height * 0.5} L${width} ${height * 0.72} V${height} H0Z" fill="${ground}"/>`
  )
}

export function speech (seconds: number, seed: number): string {
  const rate = 8000
  const count = Math.floor(rate * seconds)
  const buffer = new ArrayBuffer(44 + count * 2)
  const view = new DataView(buffer)
  const text = (offset: number, value: string): void => {
    for (let i = 0; i < value.length; i++) view.setUint8(offset + i, value.charCodeAt(i))
  }
  text(0, 'RIFF')
  view.setUint32(4, 36 + count * 2, true)
  text(8, 'WAVEfmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, 1, true)
  view.setUint32(24, rate, true)
  view.setUint32(28, rate * 2, true)
  view.setUint16(32, 2, true)
  view.setUint16(34, 16, true)
  text(36, 'data')
  view.setUint32(40, count * 2, true)
  let random = seed
  const next = (): number => {
    random = (random * 9301 + 49297) % 233280
    return random / 233280
  }
  const bursts = Array.from({ length: Math.ceil(seconds * 3) }, () => ({
    at: next() * seconds,
    size: 0.2 + next() * 0.8
  }))
  for (let i = 0; i < count; i++) {
    const t = i / rate
    let level = 0.04
    for (const burst of bursts) level += burst.size * Math.exp(-Math.pow((t - burst.at) / 0.12, 2))
    const value = Math.sin(2 * Math.PI * 180 * t) * 0.6 + Math.sin(2 * Math.PI * 310 * t) * 0.4
    view.setInt16(44 + i * 2, Math.max(-1, Math.min(1, value * Math.min(level, 1) * 0.8)) * 0x7fff, true)
  }
  return objectUrl(buffer, 'audio/wav')
}

export function pdf (title: string): string {
  const lines = [
    'Revenue grew in every region this quarter.',
    'Costs stayed within the plan.',
    'Next steps are listed on page two.'
  ]
  const text = [
    `BT /F1 24 Tf 72 720 Td (${title}) Tj ET`,
    ...lines.map((line, i) => `BT /F1 12 Tf 72 ${680 - i * 20} Td (${line}) Tj ET`)
  ].join('\n')
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${text.length} >>\nstream\n${text}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'
  ]
  let body = '%PDF-1.4\n'
  const offsets: number[] = []
  objects.forEach((object, i) => {
    offsets.push(body.length)
    body += `${i + 1} 0 obj\n${object}\nendobj\n`
  })
  const xref = body.length
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`
  body += offsets.map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`).join('')
  body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`
  return objectUrl(body, 'application/pdf')
}

const MARKDOWN = `# Release notes 2026.10

Attachments are now grouped by kind, and **Download all** saves every file of a message at once.

## What changed

- Media, documents, audio and links each get a block of their own
- A voice note shows *VOICE* instead of the container the phone recorded
- Markdown files open formatted, with the source a click away

| Area | Before | After |
|---|---|---|
| Square screenshots | 96 px | own size |
| Retry on a failed upload | regular | medium weight |

\`\`\`ts
const order = [Media, File, Audio, Link]
\`\`\`

> A reply in a thread is marked in its chip as well.

## Checklist

- [x] Group attachments by kind
- [x] Keep the order when editing a message
- [ ] Measure the preview service on a cold cache
`

// Numbered, so the start or the end of what is shown can be told apart.
function longMarkdown (kb: number): string {
  let text = ''
  for (let i = 1; text.length < kb * 1024; i++) {
    text += `## Section ${i}\n\nParagraph ${i} with **bold** words, \`code\` and a [link](https://example.com/${i}).\n\n- point ${i}.1\n- point ${i}.2\n\n`
  }
  return text
}

const LOG = Array.from(
  { length: 40 },
  (_, i) =>
    `2026-10-21 12:${String(i).padStart(2, '0')}:07 INFO  worker-${i % 4} processed batch ${1000 + i} in ${20 + ((i * 7) % 30)} ms`
).join('\n')

/** A file that will not load, as a format without a preview behaves. */
const missing = (name: string): string => `https://files.invalid/${encodeURIComponent(name)}`

let counter = 0
function attachment (name: string, type: string, size: number, file: string, extra: Record<string, any> = {}): any {
  counter++
  return {
    _id: `story-attachment-${counter}`,
    _class: 'attachment:class:Attachment',
    space: 'story-space',
    attachedTo: 'story-message',
    attachedToClass: 'chunter:class:ChatMessage',
    collection: 'attachments',
    modifiedBy: 'storybook',
    modifiedOn: 0,
    createdBy: 'storybook',
    name,
    type,
    size,
    file,
    lastModified: 0,
    ...extra
  }
}

const DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
const PPTX = 'application/vnd.openxmlformats-officedocument.presentationml.presentation'

export function createFixtures (): Record<string, any> {
  const voiceFile = speech(7, 7)
  return {
    pdf: attachment('Quarterly report Q3 2026.pdf', 'application/pdf', 1_240_000, page('Quarterly report', '#d4513b')),
    docx: attachment('Product roadmap — final version v3.docx', DOCX, 48_200, page('Product roadmap', '#2f6fd1')),
    docxBare: attachment('Meeting notes.docx', DOCX, 18_400, missing('Meeting notes.docx')),
    xlsx: attachment('Budget 2026.xlsx', XLSX, 96_700, page('Budget 2026', '#2e8b57', true)),
    pptx: attachment('Kickoff deck.pptx', PPTX, 5_820_000, missing('Kickoff deck.pptx')),
    // A thumbnail recorded on upload that the preview service no longer draws: a file id, not an address.
    pptxThumb: attachment('Quarterly review.pptx', PPTX, 10_500_000, 'story-no-preview-deck', {
      metadata: { thumbnail: { width: 1500, height: 844, blurhash: 'UIQ]+y?Ixu-;?Ij[%Lay%MRjWUof~qRkayt7' } }
    }),
    zip: attachment('design-assets.zip', 'application/zip', 34_500_000, missing('design-assets.zip')),
    apk: attachment(
      'app-release.apk',
      'application/vnd.android.package-archive',
      61_200_000,
      missing('app-release.apk')
    ),
    txt: attachment('server.log', 'text/plain', 2_300, missing('server.log')),
    pdfReal: attachment('Quarterly report Q3 2026.pdf', 'application/pdf', 1_240_000, pdf('Quarterly report Q3 2026')),
    log: attachment('server.log', 'text/plain', LOG.length, objectUrl(LOG, 'text/plain')),
    markdown: attachment('release-notes.md', 'text/markdown', MARKDOWN.length, objectUrl(MARKDOWN, 'text/markdown')),
    markdownLarge: attachment(
      'handbook.md',
      'text/markdown',
      140 * 1024,
      objectUrl(longMarkdown(140), 'text/markdown')
    ),
    markdownHuge: attachment(
      'changelog.md',
      'text/markdown',
      300 * 1024,
      objectUrl(longMarkdown(300), 'text/markdown')
    ),
    longName: attachment(
      'Протокол встречи с подрядчиком по согласованию сроков второго этапа — исправленная редакция от 14 октября.pdf',
      'application/pdf',
      312_000,
      page('Протокол встречи', '#d4513b')
    ),
    music: attachment('Morning ambient loop.mp3', 'audio/mpeg', 2_100_000, speech(12, 3)),
    musicLarge: attachment('Podcast episode 42 — full.mp3', 'audio/mpeg', 48_000_000, speech(4, 11)),
    voice: attachment('voice-message.webm', 'audio/webm', 56_000, voiceFile, {
      state: 'done',
      durationSec: 7,
      text: 'Привет! Посмотри, пожалуйста, новый макет вложений — мне кажется, документы стали заметно понятнее.'
    }),
    voicePending: attachment('voice-message.webm', 'audio/webm', 42_000, voiceFile, {
      state: 'pending',
      durationSec: 5
    }),
    voiceFailed: attachment('voice-message.webm', 'audio/webm', 42_000, voiceFile, { state: 'failed', durationSec: 5 }),
    image: attachment(
      'Sunset at the bay.jpg',
      'image/jpeg',
      820_000,
      photo(1600, 1000, '#7aa7d9', '#3d5a40', '#ffd27a'),
      {
        metadata: { originalWidth: 1600, originalHeight: 1000 }
      }
    ),
    // A light screenshot: the case where the shade under the header matters.
    imageLight: attachment(
      'image.png',
      'image/png',
      8_700,
      svg(
        580,
        180,
        '<rect width="580" height="180" fill="#fff"/><rect x="20" y="20" width="160" height="30" rx="6" fill="#eef0f6"/><rect x="200" y="28" width="120" height="14" rx="4" fill="#d5d8de"/><rect x="20" y="70" width="110" height="30" rx="6" fill="#e9eaee"/><rect x="20" y="120" width="500" height="34" rx="6" fill="#f1ecfa"/><rect x="460" y="126" width="22" height="22" rx="4" fill="#8f5fd6"/>'
      )
    ),
    imageTall: attachment(
      'Screenshot 2026-10-21.png',
      'image/png',
      410_000,
      photo(800, 1400, '#c9b8f0', '#5b4b8a', '#fff1b8'),
      {
        metadata: { originalWidth: 800, originalHeight: 1400 }
      }
    ),
    video: attachment(
      'Demo recording.mp4',
      'video/mp4',
      18_000_000,
      photo(1280, 720, '#28324a', '#151a26', '#6c8cff'),
      {
        metadata: { originalWidth: 1280, originalHeight: 720 }
      }
    )
  }
}

export function favicon (color: string, letter: string): string {
  return svg(
    64,
    64,
    `<rect width="64" height="64" rx="14" fill="${color}"/><text x="32" y="44" text-anchor="middle" font-family="Helvetica, Arial" font-size="36" font-weight="700" fill="#fff">${letter}</text>`
  )
}

/** Transparent logo running to its sides: the picture has no edge of its own. */
export function logo (color: string): string {
  return svg(
    64,
    64,
    `<rect x="0" y="14" width="44" height="38" rx="9" fill="${color}"/><path d="M44 26 L64 15 V51 L44 40 Z" fill="${color}" opacity="0.8"/><circle cx="9" cy="43" r="4" fill="#fff"/>`
  )
}

function link (details: Record<string, any>): any {
  const { title, description, image, imageWidth, imageHeight, url } = details
  return attachment(
    `link-${counter + 1}`,
    'application/link-preview',
    256,
    objectUrl(JSON.stringify(details), 'application/link-preview'),
    // details: not on a real attachment; the state fixtures build on them.
    { metadata: { title, description, image, imageWidth, imageHeight, url }, details }
  )
}

/** Never answered by the Storybook dev server (see vite.config.mts), to show the loading state. */
export const hanging = (name: string): string => `${window.location.origin}/__hang/${encodeURIComponent(name)}`

function linkWith (file: string, metadata?: Record<string, any>): any {
  return attachment(`link-${counter + 1}`, 'application/link-preview', 256, file, metadata != null ? { metadata } : {})
}

function site (hostname: string): { host: string, hostname: string } {
  return { host: `https://${hostname}`, hostname }
}

export function createLinkFixtures (): Record<string, any> {
  const blog = favicon('#e0743c', 'B')
  const docs = favicon('#3c7be0', 'D')
  const video = favicon('#d64545', 'V')
  const code = favicon('#2f2f36', 'C')
  return {
    article: link({
      ...site('blog.example.com'),
      url: 'https://blog.example.com/posts/attachments-redesign',
      icon: blog,
      title: 'How we redesigned attachments in chat',
      description:
        'Cards that keep their height before loading, one player per chat and a waveform drawn from the file itself.',
      image: photo(1200, 630, '#f2b48c', '#7a4a3a', '#fff1d6'),
      imageWidth: 1200,
      imageHeight: 630
    }),
    video: link({
      ...site('video.example.net'),
      url: 'https://video.example.net/watch?v=42',
      icon: video,
      title: 'Product demo — autumn release',
      description: 'A ten-minute walk through the new chat, search and attachments.',
      image: photo(1280, 720, '#28324a', '#151a26', '#6c8cff'),
      imageWidth: 1280,
      imageHeight: 720
    }),
    tall: link({
      ...site('mobile.example.app'),
      url: 'https://mobile.example.app/screens/onboarding',
      icon: favicon('#7c5ce0', 'M'),
      title: 'Onboarding screens',
      description: 'Three screens of the mobile onboarding.',
      image: photo(800, 1400, '#c9b8f0', '#5b4b8a', '#fff1b8'),
      imageWidth: 800,
      imageHeight: 1400
    }),
    square: link({
      ...site('code.example.dev'),
      url: 'https://code.example.dev/platform/foundation',
      icon: code,
      title: 'platform/foundation',
      description: 'The monorepo of the platform: plugins, services and the desktop app.',
      image: favicon('#2f2f36', 'C'),
      imageWidth: 400,
      imageHeight: 400
    }),
    noImage: link({
      ...site('docs.example.org'),
      url: 'https://docs.example.org/guides/attachments',
      icon: docs,
      title: 'Attachments guide',
      description: 'Which files the platform previews, how big they can be and where they are stored.'
    }),
    noDescription: link({
      ...site('blog.example.com'),
      url: 'https://blog.example.com/posts/release-notes',
      icon: blog,
      title: 'Release notes 2026.10',
      image: photo(1200, 630, '#9fc6e8', '#3d5a40', '#ffd27a'),
      imageWidth: 1200,
      imageHeight: 630
    }),
    titleIsHost: link({
      ...site('example.org'),
      url: 'https://example.org',
      icon: docs,
      title: 'example.org',
      description: 'A site whose page title is its own address, so the card shows the host once.'
    }),
    noUrl: link({
      ...site('intranet.example.com'),
      icon: favicon('#2e8b57', 'I'),
      title: 'Holiday schedule',
      description: 'A page without a canonical address: the title is not a link.'
    }),
    noIcon: link({
      ...site('files.example.net'),
      url: 'https://files.example.net/share/abc',
      title: 'Shared folder: design assets',
      description: 'No favicon on the site: the globe stands in.'
    }),
    brokenIcon: link({
      ...site('old.example.net'),
      url: 'https://old.example.net/page',
      icon: missing('favicon.ico'),
      title: 'An old page with a broken favicon',
      description: 'The favicon does not load: the globe stands in.'
    }),
    brokenImage: link({
      ...site('news.example.com'),
      url: 'https://news.example.com/2026/10/21/story',
      icon: favicon('#c0392b', 'N'),
      title: 'The image of this page does not load',
      description: 'The card keeps the image box and retries a few times.',
      image: missing('cover.jpg'),
      imageWidth: 1200,
      imageHeight: 630
    }),
    long: link({
      ...site('very-long-subdomain.of-a-rather-long-domain-name.example.com'),
      url: 'https://very-long-subdomain.of-a-rather-long-domain-name.example.com/a/very/long/path',
      icon: blog,
      title:
        'A very long title of an article that goes on and on about how attachments should look in a chat and why the height must be known before the file loads',
      description:
        'A long description that takes more than four lines in the card. ' +
        'It keeps going with more words, to show how the text is clamped. '.repeat(5),
      image: photo(1200, 630, '#b8e0c9', '#2e5b4b', '#fff1b8'),
      imageWidth: 1200,
      imageHeight: 630
    }),
    metadataOnly: attachment('link-metadata-only', 'application/link-preview', 256, missing('link.json'), {
      metadata: {
        title: 'Only the metadata: the JSON file did not load',
        description: 'The card falls back to the title, description and image kept on the attachment.',
        image: photo(1200, 630, '#e8d39f', '#6b5a2e', '#fff')
      }
    })
  }
}

export function createLinkStateFixtures (): Record<string, any> {
  const full = createLinkFixtures().article
  const details = full.details
  const json = objectUrl(JSON.stringify(details), 'application/link-preview')
  const meta = full.metadata
  const wide = { ...meta, image: hanging('cover.jpg') }
  const small = { ...meta, image: hanging('thumb.png'), imageWidth: 200, imageHeight: 200 }
  return {
    loaded: full,
    detailsLoading: linkWith(hanging('link.json'), meta),
    pictureLoading: linkWith(json, wide),
    thumbLoading: linkWith(json, small),
    detailsFailed: linkWith(missing('link.json'), meta),
    pictureFailed: linkWith(json, { ...meta, image: missing('cover.jpg') }),
    noMetadataLoading: linkWith(hanging('bare.json')),
    noMetadataLoaded: linkWith(objectUrl(JSON.stringify({ ...details, image: undefined }), 'application/link-preview')),
    noMetadataFailed: linkWith(missing('bare.json')),
    addressOnlyFailed: linkWith(missing('bare.json'), { url: details.url })
  }
}

export const viewerSamples: Record<string, string> = {
  image: 'Picture',
  imageLight: 'Light screenshot',
  pdfReal: 'PDF',
  log: 'Text',
  markdown: 'Markdown: formatted, with the source a click away',
  markdownLarge: 'Markdown over 100 KB: shown as source',
  markdownHuge: 'Markdown over 256 KB: the start of the file',
  music: 'Audio file',
  pptxThumb: 'Presentation: a thumbnail the service does not draw',
  zip: 'Archive: no preview',
  longName: 'Long name'
}
