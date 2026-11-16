//
// Copyright © 2024 Hardcore Engineering Inc.
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
import { type AccountDB } from '@hcengineering/account'
import { type ProviderInfo } from '@hcengineering/account-client'
import { BrandingMap, concatLink, MeasureContext, getBranding, SocialIdType } from '@hcengineering/core'
import Router from 'koa-router'
import { Issuer, Strategy } from 'openid-client'

import { Passport } from '.'
import { consumeAuthState, encodeState, handleProviderAuth, providerCookiePath, safeParseAuthState } from './utils'

const oidcSessionKey = 'oidc:auth'

export function registerOpenid (
  measureCtx: MeasureContext,
  passport: Passport,
  router: Router<any, any>,
  accountsUrl: string,
  dbPromise: Promise<AccountDB>,
  frontUrl: string,
  brandings: BrandingMap,
  signUpDisabled?: boolean
): ProviderInfo | undefined {
  const openidClientId = process.env.OPENID_CLIENT_ID
  const openidClientSecret = process.env.OPENID_CLIENT_SECRET
  const issuer = process.env.OPENID_ISSUER
  const name = 'openid'
  const displayName = process.env.OPENID_DISPLAY_NAME

  const redirectURL = '/auth/openid/callback'
  if (openidClientId === undefined || openidClientSecret === undefined || issuer === undefined) return

  Issuer.discover(issuer)
    .then((issuerObj) => {
      measureCtx.info('Discovered issuer', { issuer: issuerObj })

      const client = new issuerObj.Client({
        client_id: openidClientId,
        client_secret: openidClientSecret,
        redirect_uris: [concatLink(accountsUrl, redirectURL)],
        response_types: ['code']
      })
      measureCtx.info('Created OIDC client')

      passport.use(
        'oidc',
        new Strategy(
          { client, passReqToCallback: true, sessionKey: oidcSessionKey },
          (req: any, tokenSet: any, userinfo: any, done: any) => {
            return done(null, userinfo)
          }
        )
      )
      measureCtx.info('Registered OIDC strategy')
    })
    .catch((err) => {
      measureCtx.error('Failed to create OIDC client for IdP with the provided configuration', { err })
    })

  router.get('/auth/openid', async (ctx, next) => {
    measureCtx.info('try auth via', { provider: 'openid' })
    const path = providerCookiePath(accountsUrl)
    const state = encodeState(ctx, brandings, 'openid', path)
    const nonce = safeParseAuthState(state).consentState
    ;(ctx.request as any).session = {}

    await passport.authenticate('oidc', {
      scope: 'openid profile email',
      state
    })(ctx, next)
    const pending = (ctx.request as any).session[oidcSessionKey]
    if (pending == null) ctx.throw(500)
    ctx.cookies.set(`oauth-oidc-${nonce}`, Buffer.from(JSON.stringify(pending)).toString('base64url'), {
      signed: true,
      httpOnly: true,
      sameSite: 'lax',
      path,
      maxAge: 10 * 60 * 1000
    })
  })

  router.get(
    redirectURL,
    async (ctx, next) => {
      const path = providerCookiePath(accountsUrl)
      const state = consumeAuthState(ctx, 'openid', path)
      const name = `oauth-oidc-${state.consentState}`
      const raw = ctx.cookies.get(name, { signed: true })
      let pending
      try {
        pending = JSON.parse(Buffer.from(raw ?? '', 'base64url').toString())
      } catch {
        ctx.throw(403)
      }
      if (pending == null || pending.state !== ctx.query.state) ctx.throw(403)
      ctx.cookies.set(name, null, { signed: true, httpOnly: true, sameSite: 'lax', path })
      ;(ctx.request as any).session = { [oidcSessionKey]: pending }
      const branding = getBranding(brandings, state?.branding)

      await passport.authenticate('oidc', {
        session: false,
        failureRedirect: concatLink(branding?.front ?? frontUrl, '/login')
      })(ctx, next)
    },
    async (ctx, next) => {
      const email = ctx.state.user.email
      const verifiedEmail = (ctx.state.user.email_verified as boolean) ? email : ''
      const nameParts = (ctx.state.user.name ?? ctx.state.user.username ?? '').split(' ')
      const first: string = ctx.state.user.given_name ?? nameParts[0] ?? ''
      const last: string = ctx.state.user.family_name ?? nameParts.slice(1).join(' ')

      const db = await dbPromise
      const redirectUrl = await handleProviderAuth(
        measureCtx,
        db,
        brandings,
        frontUrl,
        'openid',
        ctx.query?.state,
        ctx.state?.user,
        verifiedEmail,
        first,
        last,
        { type: SocialIdType.OIDC, value: ctx.state.user.sub },
        signUpDisabled,
        ctx,
        providerCookiePath(accountsUrl)
      )

      if (redirectUrl !== '') {
        ctx.redirect(redirectUrl)
      }

      await next()
    }
  )

  return { name, displayName }
}
