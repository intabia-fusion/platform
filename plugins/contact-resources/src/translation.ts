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

import { createQuery, onClient } from '@intabiafusion/presentation'
import { getCurrentEmployee, type Translation } from '@intabiafusion/contact'
import { writable } from 'svelte/store'

import contact from './plugin'

export const languagesDisplayData: Record<string, { emoji: string, label: string }> = {
  bg: { emoji: '🇧🇬', label: 'Български' },
  ca: { emoji: '🇨🇦', label: 'Català' },
  zh: { emoji: '🇨🇳', label: '简体中文' },
  cs: { emoji: '🇨🇿', label: 'Čeština' },
  da: { emoji: '🇩🇰', label: 'Dansk' },
  nl: { emoji: '🇳🇱', label: 'Nederlands' },
  en: { emoji: '🇺🇸', label: 'English' },
  et: { emoji: '🇪🇪', label: 'Eesti' },
  fi: { emoji: '🇫🇮', label: 'Suomi' },
  fr: { emoji: '🇫🇷', label: 'Français' },
  de: { emoji: '🇩🇪', label: 'Deutsch' },
  'de-CH': { emoji: '🇨🇭', label: 'Schweizerdeutsch' },
  el: { emoji: '🇬🇷', label: 'Ελληνικά' },
  hi: { emoji: '🇮🇳', label: 'हिन्दी' },
  hu: { emoji: '🇭🇺', label: 'Magyar' },
  id: { emoji: '🇮🇩', label: 'Bahasa Indonesia' },
  it: { emoji: '🇮🇹', label: 'Italiano' },
  ja: { emoji: '🇯🇵', label: '日本語' },
  ko: { emoji: '🇰🇷', label: '한국어' },
  lv: { emoji: '🇱🇻', label: 'Latviešu' },
  lt: { emoji: '🇱🇹', label: 'Lietuvių' },
  ms: { emoji: '🇲🇾', label: 'Bahasa Melayu' },
  no: { emoji: '🇳🇴', label: 'Norsk' },
  pl: { emoji: '🇵🇱', label: 'Polski' },
  pt: { emoji: '🇵🇹', label: 'Português' },
  ro: { emoji: '🇷🇴', label: 'Română' },
  ru: { emoji: '🇷🇺', label: 'Русский' },
  sk: { emoji: '🇸🇰', label: 'Slovenčina' },
  es: { emoji: '🇪🇸', label: 'Español' },
  sv: { emoji: '🇸🇪', label: 'Svenska' },
  th: { emoji: '🇹🇭', label: 'ไทย' },
  tr: { emoji: '🇹🇷', label: 'Türkçe' },
  uk: { emoji: '🇺🇦', label: 'Українська' },
  vi: { emoji: '🇻🇳', label: 'Tiếng Việt' }
}

export const translationStore = writable<Translation | undefined>(undefined)

const translationQuery = createQuery(true)

onClient(() => {
  const me = getCurrentEmployee()
  translationQuery.query(contact.class.Translation, { attachedTo: me }, (res) => {
    translationStore.set(res[0])
  })
})
