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

// Copy only, no markup: the layout stays in ../mail.ts. The language list matches the platform's
// i18n set (plugins/*-assets/lang) and server/account-service's letters.

export type MailLang = 'en' | 'ru' | 'de' | 'fr' | 'es' | 'it' | 'pt' | 'pt-br' | 'cs' | 'tr' | 'ja' | 'zh'

const LANGS: MailLang[] = ['en', 'ru', 'de', 'fr', 'es', 'it', 'pt', 'pt-br', 'cs', 'tr', 'ja', 'zh']

const DEFAULT_LANG: MailLang = 'ru'

/** `pt-BR` stays `pt-br`; `pt-PT` and any other regional tag fall back to its two-letter language. */
export function resolveLang (language: string | null | undefined): MailLang {
  const tag = (language ?? '').trim().toLowerCase()
  if (tag === '') return DEFAULT_LANG

  const exact = LANGS.find((l) => l === tag)
  if (exact !== undefined) return exact

  const short = tag.slice(0, 2)
  return LANGS.find((l) => l === short) ?? DEFAULT_LANG
}

export interface WebhookDisabledCopy {
  subject: string
  lead: string // {endpoint}
  note: string
  endpointLabel: string
  errorLabel: string
}

export const WEBHOOK_DISABLED: Record<MailLang, WebhookDisabledCopy> = {
  en: {
    subject: 'Outgoing webhook disabled',
    lead: 'Your outgoing webhook {endpoint} was disabled after repeated delivery failures.',
    note: 'Re-enable it from workspace settings once the issue is fixed.',
    endpointLabel: 'Webhook',
    errorLabel: 'Last error'
  },
  ru: {
    subject: 'Исходящий вебхук отключён',
    lead: 'Ваш исходящий вебхук {endpoint} отключён из-за повторных ошибок доставки.',
    note: 'Включите его снова в настройках пространства, когда проблема будет устранена.',
    endpointLabel: 'Вебхук',
    errorLabel: 'Последняя ошибка'
  },
  de: {
    subject: 'Ausgehender Webhook deaktiviert',
    lead: 'Ihr ausgehender Webhook {endpoint} wurde nach wiederholten Zustellfehlern deaktiviert.',
    note: 'Aktivieren Sie ihn in den Workspace-Einstellungen wieder, sobald das Problem behoben ist.',
    endpointLabel: 'Webhook',
    errorLabel: 'Letzter Fehler'
  },
  fr: {
    subject: 'Webhook sortant désactivé',
    lead: 'Votre webhook sortant {endpoint} a été désactivé après plusieurs échecs de livraison.',
    note: "Réactivez-le dans les paramètres de l'espace de travail une fois le problème résolu.",
    endpointLabel: 'Webhook',
    errorLabel: 'Dernière erreur'
  },
  es: {
    subject: 'Webhook saliente deshabilitado',
    lead: 'Tu webhook saliente {endpoint} se ha deshabilitado tras varios fallos de entrega.',
    note: 'Vuelve a activarlo en los ajustes del espacio de trabajo cuando se resuelva el problema.',
    endpointLabel: 'Webhook',
    errorLabel: 'Último error'
  },
  it: {
    subject: 'Webhook in uscita disabilitato',
    lead: 'Il tuo webhook in uscita {endpoint} è stato disabilitato dopo ripetuti errori di consegna.',
    note: 'Riabilitalo nelle impostazioni dello spazio di lavoro quando il problema sarà risolto.',
    endpointLabel: 'Webhook',
    errorLabel: 'Ultimo errore'
  },
  pt: {
    subject: 'Webhook de saída desativado',
    lead: 'O seu webhook de saída {endpoint} foi desativado após várias falhas de entrega.',
    note: 'Reative-o nas definições do espaço de trabalho quando o problema estiver resolvido.',
    endpointLabel: 'Webhook',
    errorLabel: 'Último erro'
  },
  'pt-br': {
    subject: 'Webhook de saída desativado',
    lead: 'Seu webhook de saída {endpoint} foi desativado após várias falhas de entrega.',
    note: 'Reative-o nas configurações do espaço de trabalho quando o problema for resolvido.',
    endpointLabel: 'Webhook',
    errorLabel: 'Último erro'
  },
  cs: {
    subject: 'Odchozí webhook deaktivován',
    lead: 'Váš odchozí webhook {endpoint} byl deaktivován po opakovaných chybách doručení.',
    note: 'Znovu jej zapněte v nastavení pracovního prostoru, až bude problém vyřešen.',
    endpointLabel: 'Webhook',
    errorLabel: 'Poslední chyba'
  },
  tr: {
    subject: 'Giden webhook devre dışı bırakıldı',
    lead: 'Giden webhook {endpoint}, tekrarlanan teslimat hataları nedeniyle devre dışı bırakıldı.',
    note: 'Sorun giderildiğinde çalışma alanı ayarlarından yeniden etkinleştirin.',
    endpointLabel: 'Webhook',
    errorLabel: 'Son hata'
  },
  ja: {
    subject: '送信 Webhook が無効になりました',
    lead: '送信 Webhook {endpoint} は、配信の失敗が繰り返されたため無効になりました。',
    note: '問題が解決したら、ワークスペースの設定から再度有効にしてください。',
    endpointLabel: 'Webhook',
    errorLabel: '最後のエラー'
  },
  zh: {
    subject: '传出 Webhook 已停用',
    lead: '传出 Webhook {endpoint} 因多次投递失败已被停用。',
    note: '问题解决后，请在空间设置中重新启用。',
    endpointLabel: 'Webhook',
    errorLabel: '最近的错误'
  }
}
