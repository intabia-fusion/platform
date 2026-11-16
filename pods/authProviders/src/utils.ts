//
// Copyright © 2024 Hardcore Engineering, Inc.
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
import { AccountDB, joinWithProvider, LoginInfo, loginOrSignUpWithProvider } from '@hcengineering/account'
import { BrandingMap, concatLink, getBranding, MeasureContext, SocialKey } from '@hcengineering/core'
import { IncomingHttpHeaders } from 'http'
import { randomBytes } from 'crypto'
import qs from 'querystringify'

export function getHost (headers: IncomingHttpHeaders): string | undefined {
  let host: string | undefined
  const origin = headers.origin ?? headers.referer
  if (origin !== undefined) {
    host = new URL(origin).host
  }

  return host
}

export interface AuthState {
  inviteId?: string
  branding?: string
  autoJoin?: boolean
  navigateUrl?: string
  consentState?: string
}

export function safeParseAuthState (rawState: string | undefined): AuthState {
  if (rawState == null) {
    return {}
  }

  try {
    return JSON.parse(decodeURIComponent(rawState))
  } catch {
    return {}
  }
}

const providerCookieTtl = 10 * 60 * 1000

export function providerCookiePath (accountsUrl: string): string {
  return `${new URL(accountsUrl).pathname.replace(/\/$/, '')}/auth`
}

export function encodeState (ctx: any, brandings: BrandingMap, provider: string, path: string): string {
  const consentState = randomBytes(32).toString('hex')
  ctx.cookies.set(
    `oauth-state-${consentState}`,
    Buffer.from(JSON.stringify({ provider, createdOn: Date.now() })).toString('base64url'),
    {
      signed: true,
      httpOnly: true,
      sameSite: 'lax',
      path,
      maxAge: providerCookieTtl
    }
  )
  const host = getHost(ctx.request.headers)
  const branding = host !== undefined ? (brandings[host]?.key ?? undefined) : undefined
  const state: AuthState = {
    inviteId: ctx.query?.inviteId,
    branding,
    autoJoin: ctx.query?.autoJoin !== undefined,
    navigateUrl: ctx.query?.navigateUrl,
    consentState
  }

  return encodeURIComponent(JSON.stringify(state))
}

export function consumeAuthState (ctx: any, provider: string, path: string): AuthState {
  const state = safeParseAuthState(ctx.query?.state)
  const nonce = state?.consentState
  if (typeof nonce !== 'string' || !/^[a-f0-9]{64}$/.test(nonce)) ctx.throw(403)
  const name = `oauth-state-${nonce}`
  const raw = ctx.cookies.get(name, { signed: true })
  let pending
  try {
    pending = JSON.parse(Buffer.from(raw ?? '', 'base64url').toString())
  } catch {
    ctx.throw(403)
  }
  if (
    pending?.provider !== provider ||
    typeof pending.createdOn !== 'number' ||
    pending.createdOn > Date.now() ||
    Date.now() - pending.createdOn > providerCookieTtl
  ) {
    ctx.throw(403)
  }
  ctx.cookies.set(name, null, { signed: true, httpOnly: true, sameSite: 'lax', path })
  return state
}

export async function handleProviderAuth (
  measureCtx: MeasureContext,
  db: AccountDB,
  brandings: BrandingMap,
  frontUrl: string,
  providerType: string,
  rawState: string | undefined,
  user: any,
  email: string | undefined,
  first: string,
  last: string,
  socialKey: SocialKey,
  signUpDisabled: boolean | undefined,
  request?: any,
  cookiePath?: string,
  consentAccepted = false
): Promise<string> {
  try {
    measureCtx.info('Provider auth handler', { email, type: providerType })
    let loginInfo: LoginInfo | null
    const state = safeParseAuthState(rawState)
    const branding = getBranding(brandings, state?.branding)

    if (state.inviteId != null && state.inviteId !== '' && state.autoJoin !== true) {
      loginInfo = await joinWithProvider(
        measureCtx,
        db,
        null,
        email,
        first,
        last,
        state.inviteId,
        socialKey,
        signUpDisabled === true || !consentAccepted,
        consentAccepted
      )
    } else {
      loginInfo = await loginOrSignUpWithProvider(
        measureCtx,
        db,
        null,
        email,
        first,
        last,
        socialKey,
        signUpDisabled === true || state.autoJoin === true || !consentAccepted,
        consentAccepted
      )
    }

    if (loginInfo === null) {
      if (
        !consentAccepted &&
        signUpDisabled !== true &&
        state.autoJoin !== true &&
        request != null &&
        cookiePath != null
      ) {
        const nonce = randomBytes(32).toString('hex')
        const pending = {
          nonce,
          createdOn: Date.now(),
          providerType,
          rawState,
          email,
          first,
          last,
          socialKey
        }
        request.cookies.set(`oauth-consent-${nonce}`, Buffer.from(JSON.stringify(pending)).toString('base64url'), {
          signed: true,
          httpOnly: true,
          sameSite: 'lax',
          path: cookiePath,
          maxAge: providerCookieTtl
        })
        return concatLink(branding?.front ?? frontUrl, `/login/auth?providerConsent=${nonce}`)
      }
      measureCtx.info('Failed to auth: no associated account found', {
        email,
        type: providerType,
        user
      })
      return concatLink(branding?.front ?? frontUrl, '/login')
    } else {
      const origin = concatLink(branding?.front ?? frontUrl, '/login/auth')
      const queryObj: any = { token: loginInfo.token }
      if (state.autoJoin === true) {
        queryObj.autoJoin = state.autoJoin
      }
      if (state.autoJoin === true || (loginInfo.onboarding != null && loginInfo.onboarding.stage !== 'complete')) {
        queryObj.inviteId = state.inviteId
        queryObj.navigateUrl = state.navigateUrl
      }

      const query = encodeURIComponent(qs.stringify(queryObj))

      // Successful authentication, redirect to your application
      measureCtx.info('Success auth, redirect', { email, type: providerType, target: origin })
      return `${origin}?${query}`
    }
  } catch (err: any) {
    measureCtx.error('failed to auth', { err, type: providerType, user })
    return ''
  }
}
