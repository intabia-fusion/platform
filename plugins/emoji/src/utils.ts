//
// Copyright © 2025 Hardcore Engineering Inc.
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

/* webpackChunkName: "emoji-lang-en" */
import EMOJI_REGEX from 'emojibase-regex'
/* webpackChunkName: "emoji-base" */
import EMOTICON_REGEX from 'emojibase-regex/emoticon'
/* webpackChunkName: "emoji-base" */
import SHORTCODE_REGEX from 'emojibase-regex/shortcode'

import {
  joinShortcodes,
  Emoji,
  type Locale,
  type CompactEmoji,
  type FetchEmojisExpandedOptions,
  type FetchEmojisOptions,
  type FetchFromCDNOptions,
  type MessagesDataset,
  type ShortcodesDataset
} from 'emojibase'
import emojiPlugin from './plugin'
import { getResource, getResourceP } from '@hcengineering/platform'
import { ParsedTextWithEmojis } from './types'

export const emojiRegex = new RegExp(`(?:^|\\s)(${EMOJI_REGEX.source})$`)
export const emojiGlobalRegex = new RegExp(EMOJI_REGEX.source, EMOJI_REGEX.flags + 'g')

export const emoticonRegex = new RegExp(`(?:^|\\s)(${EMOTICON_REGEX.source})$`)
export const emoticonGlobalRegex = new RegExp(EMOTICON_REGEX.source, EMOTICON_REGEX.flags + 'g')

export const shortcodeRegex = new RegExp(`(?:^|\\s)(${SHORTCODE_REGEX.source})$`)
export const shortcodeGlobalRegex = new RegExp(SHORTCODE_REGEX.source, SHORTCODE_REGEX.flags + 'g')

async function importEmoji (lang: Locale, compact: boolean): Promise<Emoji[]> {
  switch (lang) {
    case 'bn':
      return (
        await import(
          /* webpackMode: "lazy" */
          /* webpackChunkName: "emoji-lang-bn" */
          `emojibase-data/${lang}/${compact ? 'compact' : 'data'}.json`
        )
      ).default as Emoji[]

    case 'es-mx':
      return (
        await import(
          /* webpackMode: "lazy" */
          /* webpackChunkName: "emoji-lang-es-mx" */
          `emojibase-data/${lang}/${compact ? 'compact' : 'data'}.json`
        )
      ).default as Emoji[]
    case 'fr':
      return (
        await import(
          /* webpackMode: "lazy" */
          /* webpackChunkName: "emoji-lang-fr" */
          `emojibase-data/${lang}/${compact ? 'compact' : 'data'}.json`
        )
      ).default as Emoji[]
    case 'it':
      return (
        await import(
          /* webpackMode: "lazy" */
          /* webpackChunkName: "emoji-lang-it" */
          `emojibase-data/${lang}/${compact ? 'compact' : 'data'}.json`
        )
      ).default as Emoji[]
    case 'pl':
      return (
        await import(
          /* webpackMode: "lazy" */
          /* webpackChunkName: "emoji-lang-pl" */
          `emojibase-data/${lang}/${compact ? 'compact' : 'data'}.json`
        )
      ).default as Emoji[]
    case 'ru':
      return (
        await import(
          /* webpackMode: "lazy" */
          /* webpackChunkName: "emoji-lang-ru" */
          `emojibase-data/${lang}/${compact ? 'compact' : 'data'}.json`
        )
      ).default as Emoji[]
    case 'es':
      return (
        await import(
          /* webpackMode: "lazy" */
          /* webpackChunkName: "emoji-lang-es" */
          `emojibase-data/${lang}/${compact ? 'compact' : 'data'}.json`
        )
      ).default as Emoji[]
    case 'zh':
      return (
        await import(
          /* webpackMode: "lazy" */
          /* webpackChunkName: "emoji-lang-zh" */
          `emojibase-data/${lang}/${compact ? 'compact' : 'data'}.json`
        )
      ).default as Emoji[]
    case 'de':
      return (
        await import(
          /* webpackMode: "lazy" */
          /* webpackChunkName: "emoji-lang-de" */
          `emojibase-data/${lang}/${compact ? 'compact' : 'data'}.json`
        )
      ).default as Emoji[]
  }
  return (
    await import(
      /* webpackMode: "lazy" */
      /* webpackChunkName: "emoji-lang-en" */
      `emojibase-data/${lang}/${compact ? 'compact' : 'data'}.json`
    )
  ).default as Emoji[]
}

async function fetchEmojis (locale: Locale, options: FetchEmojisOptions & { compact: true }): Promise<CompactEmoji[]>

async function fetchEmojis (locale: Locale, options?: FetchEmojisOptions & { compact?: false }): Promise<Emoji[]>

async function fetchEmojis (locale: Locale, options: FetchEmojisExpandedOptions = {}): Promise<unknown[]> {
  const { compact = false, shortcodes: presets = [] } = options
  try {
    const emojis = await importEmoji(locale, compact)
    const shortcodes: ShortcodesDataset[] = []

    for (const preset of presets) {
      const shortcodeData = (await import(`emojibase-data/${locale}/shortcodes/${preset}.json`))
        .default as ShortcodesDataset
      shortcodes.push(shortcodeData)
    }

    return joinShortcodes(emojis, shortcodes)
  } catch (e) {
    return compact
      ? await fetchEmojis('en', { ...options, compact: true })
      : await fetchEmojis('en', { ...options, compact: false })
  }
}

async function fetchMessages (locale: Locale, options?: FetchFromCDNOptions): Promise<MessagesDataset> {
  try {
    return (await import(`emojibase-data/${locale}/messages.json`)).default as MessagesDataset
  } catch (e) {
    return await fetchMessages('en', options)
  }
}

async function loadParseEmojisFunction (): Promise<((text: string) => ParsedTextWithEmojis) | undefined> {
  try {
    return await getResource(emojiPlugin.functions.ParseTextWithEmojis)
  } catch (e) {
    console.log('Cannot locate emoji parsing function')
    return undefined
  }
}

function getParseEmojisFunction (): ((text: string) => ParsedTextWithEmojis) | undefined {
  try {
    const c = getResourceP(emojiPlugin.functions.ParseTextWithEmojis)
    if (c instanceof Promise) {
      return undefined
    }
    return c
  } catch (e) {
    console.log('Cannot locate emoji parsing function')
    return undefined
  }
}

export { fetchEmojis, fetchMessages, loadParseEmojisFunction, type Locale, getParseEmojisFunction }
