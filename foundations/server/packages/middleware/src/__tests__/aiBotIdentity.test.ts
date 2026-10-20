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
import core, {
  type Account,
  type AccountUuid,
  AccountRole,
  aiBotAccountEmail,
  MeasureMetricsContext,
  type PersonId,
  type SocialId,
  SocialIdType,
  type Tx
} from '@hcengineering/core'
import platform from '@hcengineering/platform'
import type { Middleware, PipelineContext, TxMiddlewareResult } from '@hcengineering/server-core'
import { IdentityMiddleware, isAiBotAccount } from '../identity'
import { PluginConfigurationMiddleware } from '../pluginConfig'

const anyContext = {} as unknown as PipelineContext
const VICTIM = 'victim-social' as PersonId
const VICTIM_ACCOUNT = 'victim-account' as AccountUuid
const CALLER = 'caller-account' as AccountUuid

function socialId (type: SocialIdType, value: string, confirmed: boolean = true): SocialId {
  return {
    _id: `${type}:${value}` as PersonId,
    type,
    value,
    key: `${type}:${value}`,
    verifiedOn: confirmed ? Date.now() : undefined
  }
}

function makeAccount (fullSocialIds: SocialId[], role: AccountRole = AccountRole.User): Account {
  return {
    uuid: CALLER,
    role,
    primarySocialId: fullSocialIds[0]._id,
    socialIds: fullSocialIds.map((it) => it._id),
    fullSocialIds
  }
}

// next-middleware: records whether the tx got through.
function makeNext (): { next: Middleware, txCalled: () => boolean } {
  let txCalled = false
  const next = {
    tx: async (): Promise<TxMiddlewareResult> => {
      txCalled = true
      return {}
    }
  } as unknown as Middleware
  return { next, txCalled: () => txCalled }
}

function makeCtx (account: Account): any {
  const ctx = new MeasureMetricsContext('test', {})
  const owners = new Map([[VICTIM, { accountUuid: VICTIM_ACCOUNT }]])
  ;(ctx as any).contextData = { account, socialStringsToUsers: owners }
  return ctx
}

// The middleware throws before it returns a promise, so the call is wrapped to get a rejection.
async function runTx (mw: Middleware, account: Account, tx: Tx): Promise<void> {
  await mw.tx(makeCtx(account), [tx])
}

// A write that claims to be made by somebody else.
const writeAsVictim = {
  _class: core.class.TxCreateDoc,
  _id: 'tx1',
  modifiedBy: VICTIM,
  objectClass: core.class.Space
} as unknown as Tx

const createPluginConfig = {
  _class: core.class.TxCreateDoc,
  _id: 'tx2',
  modifiedBy: VICTIM,
  objectClass: core.class.PluginConfiguration
} as unknown as Tx

const botEmailId = socialId(SocialIdType.EMAIL, aiBotAccountEmail)
const sameValueOtherType = [SocialIdType.GITHUB, SocialIdType.OIDC, SocialIdType.GOOGLE, SocialIdType.PHONE]

describe('isAiBotAccount', () => {
  it('knows the bot by a confirmed email', () => {
    expect(isAiBotAccount(makeAccount([botEmailId]))).toBe(true)
  })

  it.each(sameValueOtherType)('ignores a %s social id with the bot email as value', (type) => {
    expect(isAiBotAccount(makeAccount([socialId(type, aiBotAccountEmail)]))).toBe(false)
  })

  it('ignores an unconfirmed email', () => {
    expect(isAiBotAccount(makeAccount([socialId(SocialIdType.EMAIL, aiBotAccountEmail, false)]))).toBe(false)
  })

  it('ignores another email', () => {
    expect(isAiBotAccount(makeAccount([socialId(SocialIdType.EMAIL, 'user@example.com')]))).toBe(false)
  })
})

describe('IdentityMiddleware', () => {
  const ctx = new MeasureMetricsContext('test', {})

  it('lets the bot write on behalf of a user', async () => {
    const { next, txCalled } = makeNext()
    const mw = await IdentityMiddleware.create(ctx, anyContext, next)

    await runTx(mw, makeAccount([botEmailId]), writeAsVictim)

    expect(txCalled()).toBe(true)
  })

  it.each(sameValueOtherType)('rejects a forged author for a %s social id with the bot email', async (type) => {
    const { next, txCalled } = makeNext()
    const mw = await IdentityMiddleware.create(ctx, anyContext, next)

    await expect(runTx(mw, makeAccount([socialId(type, aiBotAccountEmail)]), writeAsVictim)).rejects.toMatchObject({
      status: { code: platform.status.AccountMismatch }
    })
    expect(txCalled()).toBe(false)
  })

  it('rejects a forged author for an unconfirmed bot email', async () => {
    const { next, txCalled } = makeNext()
    const mw = await IdentityMiddleware.create(ctx, anyContext, next)
    const account = makeAccount([socialId(SocialIdType.EMAIL, aiBotAccountEmail, false)])

    await expect(runTx(mw, account, writeAsVictim)).rejects.toMatchObject({
      status: { code: platform.status.AccountMismatch }
    })
    expect(txCalled()).toBe(false)
  })
})

describe('PluginConfigurationMiddleware', () => {
  const ctx = new MeasureMetricsContext('test', {})

  it('lets the bot change plugin configuration', async () => {
    const { next, txCalled } = makeNext()
    const mw = await PluginConfigurationMiddleware.create(ctx, anyContext, next)

    await runTx(mw, makeAccount([botEmailId]), createPluginConfig)

    expect(txCalled()).toBe(true)
  })

  it.each(sameValueOtherType)('keeps plugin config owner-only for a %s social id with the bot email', async (type) => {
    const { next, txCalled } = makeNext()
    const mw = await PluginConfigurationMiddleware.create(ctx, anyContext, next)
    const account = makeAccount([socialId(type, aiBotAccountEmail)])

    await expect(runTx(mw, account, createPluginConfig)).rejects.toMatchObject({
      status: { code: platform.status.Forbidden }
    })
    expect(txCalled()).toBe(false)
  })
})
