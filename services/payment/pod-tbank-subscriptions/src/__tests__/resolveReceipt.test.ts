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

import { resolveReceipt, MissingReceiptContactError } from '../server'

const ctx: any = { info: jest.fn(), warn: jest.fn(), error: jest.fn() }
const config: any = { TbankTaxation: 'usn_income', TbankVatTax: 'none' }
const ACC: any = 'acc-1'

function makeStorage (contact: any): any {
  return { getAccountContact: jest.fn().mockResolvedValue(contact) }
}

describe('resolveReceipt', () => {
  test('email present -> receipt with Email and the charged amount', async () => {
    const storage = makeStorage({ email: 'a@b.c', phone: null, locale: 'ru' })
    const r = await resolveReceipt(ctx, storage, config, ACC, 'Subscription: business (tier)', 49900)
    expect(r.Email).toBe('a@b.c')
    expect(r.Taxation).toBe('usn_income')
    expect(r.Items[0].Amount).toBe(49900)
    expect(r.Items[0].Price).toBe(49900)
    expect(r.Items[0].Quantity).toBe(1)
  })

  test('no email -> falls back to the account phone', async () => {
    const storage = makeStorage({ email: null, phone: '+79001234567', locale: null })
    const r = await resolveReceipt(ctx, storage, config, ACC, 'X', 1000)
    expect(r.Phone).toBe('+79001234567')
    expect(r.Email).toBeUndefined()
  })

  test('no email and no phone -> throws MissingReceiptContactError', async () => {
    const storage = makeStorage({ email: null, phone: null, locale: null })
    await expect(resolveReceipt(ctx, storage, config, ACC, 'X', 1000)).rejects.toBeInstanceOf(
      MissingReceiptContactError
    )
  })

  test('empty-string contacts -> throws MissingReceiptContactError', async () => {
    const storage = makeStorage({ email: '', phone: '', locale: null })
    await expect(resolveReceipt(ctx, storage, config, ACC, 'X', 1000)).rejects.toBeInstanceOf(
      MissingReceiptContactError
    )
  })

  test('getAccountContact throwing -> wrapped as MissingReceiptContactError (fail closed, no charge)', async () => {
    const storage: any = { getAccountContact: jest.fn().mockRejectedValue(new Error('accounts down')) }
    await expect(resolveReceipt(ctx, storage, config, ACC, 'X', 1000)).rejects.toBeInstanceOf(
      MissingReceiptContactError
    )
  })
})
