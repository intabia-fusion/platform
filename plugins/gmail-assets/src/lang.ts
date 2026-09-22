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

import { addStringsLoader } from '@hcengineering/platform'
import { gmailId } from '@hcengineering/gmail'

const langs: Record<string, () => Promise<any>> = {
  cs: async () => await import('../lang/cs.json'),
  de: async () => await import('../lang/de.json'),
  en: async () => await import('../lang/en.json'),
  es: async () => await import('../lang/es.json'),
  fr: async () => await import('../lang/fr.json'),
  it: async () => await import('../lang/it.json'),
  ja: async () => await import('../lang/ja.json'),
  pt: async () => await import('../lang/pt.json'),
  'pt-br': async () => await import('../lang/pt-br.json'),
  ru: async () => await import('../lang/ru.json'),
  tr: async () => await import('../lang/tr.json'),
  zh: async () => await import('../lang/zh.json')
}

export default function registerStrings (): void {
  addStringsLoader(gmailId, async (lang: string) => await (langs[lang] ?? langs.en)())
}
