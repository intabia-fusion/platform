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

// These locales have entries in the interface language selector and bundled translations.
const supportedLanguages = ['ru', 'en', 'pt', 'pt-br', 'es', 'zh', 'fr', 'it', 'cs', 'de', 'ja', 'tr']
let enabledLanguages = ['ru', 'en']

/** Configure the interface languages before initializing the theme. */
export function configureInterfaceLanguages (languages?: string): string[] {
  const configured = (languages ?? '')
    .split(',')
    .map((language) => language.trim())
    .filter((language) => supportedLanguages.includes(language))
  enabledLanguages = configured.length > 0 ? [...new Set(configured)] : ['ru', 'en']
  return [...enabledLanguages]
}

export function resolveInterfaceLanguage (language: string): string {
  if (enabledLanguages.includes(language)) return language
  return enabledLanguages.includes('en') ? 'en' : enabledLanguages[0]
}
