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

// admin.ts reads env once at module load, so set before importing and reset modules per case.
describe('billing/admin email resolution', () => {
  const OLD_ENV = process.env

  beforeEach(() => {
    jest.resetModules()
    process.env = { ...OLD_ENV }
  })

  afterAll(() => {
    process.env = OLD_ENV
  })

  test('isBillingAdminEmail matches BILLING_EMAILS, trims input', async () => {
    process.env.BILLING_EMAILS = 'billing@x.com,fin@y.com'
    const { isBillingAdminEmail, isAdminEmail } = await import('../admin')

    expect(isBillingAdminEmail('billing@x.com')).toBe(true)
    expect(isBillingAdminEmail('  fin@y.com  ')).toBe(true)
    expect(isBillingAdminEmail('other@z.com')).toBe(false)
    // billing email is not a full admin
    expect(isAdminEmail('billing@x.com')).toBe(false)
  })

  test('admin and billing sets are independent', async () => {
    process.env.ADMIN_EMAILS = 'root@x.com'
    process.env.BILLING_EMAILS = 'billing@x.com'
    const { isAdminEmail, isBillingAdminEmail } = await import('../admin')

    expect(isAdminEmail('root@x.com')).toBe(true)
    expect(isBillingAdminEmail('root@x.com')).toBe(false)
    expect(isBillingAdminEmail('billing@x.com')).toBe(true)
    expect(isAdminEmail('billing@x.com')).toBe(false)
  })

  test('empty BILLING_EMAILS -> nobody matches', async () => {
    delete process.env.BILLING_EMAILS
    const { isBillingAdminEmail } = await import('../admin')

    expect(isBillingAdminEmail('anyone@x.com')).toBe(false)
  })
})
