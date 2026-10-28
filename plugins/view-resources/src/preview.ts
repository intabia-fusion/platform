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

import contact from '@hcengineering/contact'
import core, {
  type AccountUuid,
  type Client,
  type DocPreview,
  getCurrentAccount,
  type Markup,
  type PreviewSnapshot,
  type WithLookup
} from '@hcengineering/core'
import type { DocNotifyContext } from '@hcengineering/notification'
import { type Asset, getResource, translate } from '@hcengineering/platform'
import { getClient, IconWithEmoji } from '@hcengineering/presentation'
import { markupToText } from '@hcengineering/text'
import type { AnySvelteComponent } from '@hcengineering/ui'
import view from '@hcengineering/view'
import { type Readable, readable } from 'svelte/store'

import { classIcon } from './utils'

type ParticipantsName = (client: Client, title: string, accounts: AccountUuid[]) => Promise<string>
// Resolved once for every list item; a failed load is asked again
let participantsName: Promise<ParticipantsName> | undefined

// The members a title is built from per viewer (a direct chat)
export function previewMembers (preview: PreviewSnapshot): AccountUuid[] | undefined {
  return preview.props?.members
}

// A direct is named per viewer: its shared title lists everyone, the viewer included
function isBuiltPerViewer (preview: PreviewSnapshot): boolean {
  return (previewMembers(preview)?.length ?? 0) > 0
}

// One built per viewer from the members (a named group by its name), or the shared title, or the class label
export async function getPreviewTitle (
  client: Client,
  preview: PreviewSnapshot,
  lang: string,
  withLabel = true
): Promise<string> {
  if (isBuiltPerViewer(preview)) {
    participantsName ??= getResource(contact.function.GetParticipantsName).catch((err) => {
      participantsName = undefined
      throw err
    })
    return await (
      await participantsName
    )(client, preview.props?.name ?? '', previewMembers(preview) ?? [])
  }
  if (preview.title !== '') return preview.title
  if (!withLabel) return ''
  const label = preview.label ?? client.getHierarchy().findClass(preview.objectClass)?.label
  return label != null ? await translate(label, {}, lang) : ''
}

// A list re-creates its stores on every update: a built title starts from the last one instead of blinking empty
const builtTitles = new Map<string, string>()
const BUILT_TITLES_MAX = 1000

function rememberTitle (key: string, title: string): void {
  builtTitles.delete(key)
  builtTitles.set(key, title)
  if (builtTitles.size > BUILT_TITLES_MAX) builtTitles.delete(builtTitles.keys().next().value as string)
}

// `withLabel: false` leaves a title-less preview empty for a caller that draws the class label itself.
export function previewTitle (
  client: Client,
  preview: PreviewSnapshot | undefined,
  lang: string,
  withLabel = true
): Readable<string> {
  if (preview == null) return readable('')
  // A built title depends on who views it
  const key = `${getCurrentAccount().uuid}:${preview.objectId}:${lang}:${withLabel}`
  const shared = !isBuiltPerViewer(preview) && preview.title !== ''
  return readable(shared ? preview.title : (builtTitles.get(key) ?? ''), (set) => {
    let live = true
    void getPreviewTitle(client, preview, lang, withLabel)
      .then((title) => {
        if (!shared) rememberTitle(key, title)
        if (live) set(title)
      })
      .catch((err) => {
        console.error(err)
      })
    return () => {
      live = false
    }
  })
}

export interface PreviewIcon {
  icon: Asset | AnySvelteComponent | undefined
  iconProps: Record<string, any>
}

// The icon component of the class draws from the props the server put in the preview; without one the asset
export async function getPreviewIcon (
  client: Client,
  preview: PreviewSnapshot,
  props: Record<string, any> = {}
): Promise<PreviewIcon> {
  const { objectClass, icon } = preview
  const iconMixin = client.getHierarchy().classHierarchyMixin(objectClass, view.mixin.ObjectIcon)
  if (iconMixin?.component != null) {
    const iconProps: Record<string, any> = { ...icon?.props, ...props }
    if (icon?.asset != null) iconProps.asset = icon.asset
    if (icon?.emoji != null) iconProps.emoji = icon.emoji
    return { icon: await getResource(iconMixin.component), iconProps }
  }
  if (icon?.emoji != null) return { icon: IconWithEmoji, iconProps: { icon: icon.emoji } }
  return { icon: icon?.asset ?? classIcon(client, objectClass), iconProps: {} }
}

// The preview an inbox context shows: joined, the snapshot of one no longer readable, or loaded by its ref
export async function getContextPreview (context: WithLookup<DocNotifyContext>): Promise<PreviewSnapshot | undefined> {
  const shown = shownPreview(context)
  if (shown != null) return shown
  if (context.preview == null) return undefined
  // As the inbox queries ask: an archived channel keeps its card
  return await getClient().findOne(core.class.DocPreview, { _id: context.preview }, { showArchived: true })
}

function shownPreview (context: WithLookup<DocNotifyContext>): PreviewSnapshot | undefined {
  return (context.$lookup?.preview as DocPreview | undefined) ?? context.previewSnapshot
}

// What an inbox context is called in text: a thread by its own message, anything else by its preview
export async function getContextTitle (
  client: Client,
  context: WithLookup<DocNotifyContext>,
  lang: string
): Promise<string> {
  const markup = (context.message as { message?: Markup } | undefined)?.message
  if (markup != null) return markupToText(markup).trim()
  const preview = await getContextPreview(context)
  return preview != null ? await getPreviewTitle(client, preview, lang) : ''
}

// The same as a store: the joined preview at once, a loaded one when it arrives
export function contextPreview (context: WithLookup<DocNotifyContext>): Readable<PreviewSnapshot | undefined> {
  const shown = shownPreview(context)
  return readable<PreviewSnapshot | undefined>(shown, (set) => {
    if (shown != null || context.preview == null) return
    let live = true
    void getContextPreview(context).then((preview) => {
      if (live) set(preview)
    })
    return () => {
      live = false
    }
  })
}
