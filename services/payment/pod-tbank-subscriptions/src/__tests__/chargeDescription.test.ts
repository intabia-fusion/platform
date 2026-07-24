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

import { buildChargeDescription } from '../notifications'

// No PaymentUrl -> getPlanLabel returns the raw plan id (no network), so these assert phrasing + language
// selection deterministically. Real deployments substitute the human plan label for the id.
const config: any = {}

describe('buildChargeDescription', () => {
  test('ru tier phrasing per kind', async () => {
    expect(await buildChargeDescription(config, 'business', 'tier', 'purchase', 'ru')).toBe('Подписка «business»')
    expect(await buildChargeDescription(config, 'business', 'tier', 'update', 'ru')).toBe(
      'Изменение подписки «business»'
    )
    expect(await buildChargeDescription(config, 'business', 'tier', 'renewal', 'ru')).toBe(
      'Продление подписки «business»'
    )
    expect(await buildChargeDescription(config, 'business', 'tier', 'retry', 'ru')).toBe('Оплата подписки «business»')
  })

  test('ru package phrasing', async () => {
    expect(await buildChargeDescription(config, '100gb', 'package', 'purchase', 'ru')).toBe('Пакет «100gb»')
    expect(await buildChargeDescription(config, '100gb', 'package', 'renewal', 'ru')).toBe('Продление пакета «100gb»')
  })

  test('en phrasing follows the payer locale', async () => {
    expect(await buildChargeDescription(config, 'business', 'tier', 'purchase', 'en-US')).toBe('Subscription “business”')
    expect(await buildChargeDescription(config, '100gb', 'package', 'update', 'en')).toBe('Package change “100gb”')
  })

  test('null / unsupported locale falls back to Russian (primary market)', async () => {
    expect(await buildChargeDescription(config, 'business', 'tier', 'purchase', null)).toBe('Подписка «business»')
    expect(await buildChargeDescription(config, 'business', 'tier', 'purchase', 'fr')).toBe('Подписка «business»')
  })

  test('unknown type falls back to tier phrasing', async () => {
    expect(await buildChargeDescription(config, 'x', 'support', 'renewal', 'ru')).toBe('Продление подписки «x»')
  })
})
