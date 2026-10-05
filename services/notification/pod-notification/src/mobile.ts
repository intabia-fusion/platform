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

import {
  CALL_RING_MS,
  NATIVE_PUSH_SCHEMES,
  type PushCallData,
  type PushData,
  type PushDismissAllData,
  type PushDismissData
} from '@hcengineering/notification'
import { createPrivateKey, sign } from 'crypto'
import { connect, constants, type ClientHttp2Session } from 'http2'
import config from './config'

/**
 * A native client has no service worker, so it cannot produce a Web Push
 * subscription: Apple hands out `web.push.apple.com` endpoints to Safari only,
 * and Android has no equivalent at all. Both platforms give a device token
 * instead, and it is carried in the same `PushSubscription.endpoint` field
 * under a scheme of its own - the model and the trigger stay untouched.
 */
export enum PushKind {
  Web = 'web',
  Apns = 'apns',
  ApnsVoip = 'apnsVoip',
  Fcm = 'fcm',
  RuStore = 'rustore'
}

export type PushTarget =
  | { kind: PushKind.Web }
  | { kind: PushKind.Apns, token: string }
  | { kind: PushKind.ApnsVoip, token: string }
  | { kind: PushKind.Fcm, token: string }
  | { kind: PushKind.RuStore, token: string }

export function pushTarget (endpoint: string): PushTarget {
  for (const kind of [PushKind.Apns, PushKind.ApnsVoip, PushKind.Fcm, PushKind.RuStore] as const) {
    const scheme = NATIVE_PUSH_SCHEMES[kind]
    if (endpoint.startsWith(scheme)) return { kind, token: endpoint.slice(scheme.length) }
  }
  return { kind: PushKind.Web }
}

/** A delivery outcome; `Gone` means the token is dead and its subscription must go. */
export enum Delivery {
  Ok = 'ok',
  Gone = 'gone',
  Error = 'error'
}

export function apnsConfigured (): boolean {
  return config.ApnsKeyId !== undefined && config.ApnsTeamId !== undefined && config.ApnsKey !== undefined
}

export function fcmConfigured (): boolean {
  return config.FcmServiceAccount !== undefined
}

export function rustoreConfigured (): boolean {
  // The chart passes every secret key, so an unset one arrives as "" - not configured either.
  return (config.RustoreProjectId ?? '') !== '' && (config.RustoreServiceToken ?? '') !== ''
}

const base64url = (value: string | Buffer): string =>
  (typeof value === 'string' ? Buffer.from(value) : value).toString('base64url')

function jwt (header: object, claims: object, key: string, format: 'ieee-p1363' | 'der'): string {
  const input = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(claims))}`
  const signature = sign('sha256', Buffer.from(input), { key: createPrivateKey(key), dsaEncoding: format })
  return `${input}.${base64url(signature)}`
}

// Apple rejects a token refreshed more often than once in 20 minutes and expires
// it after an hour, so the window below sits between the two.
let apnsToken: { value: string, born: number } | undefined
const APNS_TOKEN_TTL = 40 * 60 * 1000

function apnsAuth (): string {
  const now = Date.now()
  if (apnsToken !== undefined && now - apnsToken.born < APNS_TOKEN_TTL) return apnsToken.value
  const value = jwt(
    { alg: 'ES256', kid: config.ApnsKeyId },
    { iss: config.ApnsTeamId, iat: Math.floor(now / 1000) },
    config.ApnsKey as string,
    'ieee-p1363'
  )
  apnsToken = { value, born: now }
  return value
}

let apnsSession: ClientHttp2Session | undefined

function apnsConnect (): ClientHttp2Session {
  if (apnsSession !== undefined && !apnsSession.closed && !apnsSession.destroyed) return apnsSession
  const host = config.ApnsProduction ? 'https://api.push.apple.com' : 'https://api.sandbox.push.apple.com'
  const session = connect(host)
  // Without a handler an unreachable APNs takes the process down with it.
  session.on('error', (err) => {
    console.error('APNs session error', err)
  })
  apnsSession = session
  return session
}

const CALL_KIND = 'call'
const CALL_CANCEL_KIND = 'call-cancel'

export function apnsAlertPayload (data: PushData): Record<string, unknown> {
  return {
    aps: {
      alert: { title: data.title, body: data.body },
      sound: 'default',
      'thread-id': data.group ?? data.objectId ?? data.tag,
      'mutable-content': 1
    },
    url: data.url,
    domain: data.domain,
    tag: data.tag,
    objectId: data.objectId,
    objectClass: data.objectClass,
    createdOn: data.createdOn,
    workspace: data.workspace
  }
}

export function apnsDismissPayload (data: PushDismissData): Record<string, unknown> {
  return {
    aps: { 'content-available': 1 },
    kind: data.kind,
    objectId: data.objectId,
    objectClass: data.objectClass,
    tags: data.tags,
    readUpTo: data.readUpTo
  }
}

export function apnsDismissAllPayload (data: PushDismissAllData): Record<string, unknown> {
  return {
    aps: { 'content-available': 1 },
    kind: data.kind,
    workspace: data.workspace,
    readUpTo: data.readUpTo
  }
}

// What every channel carries about a call, beside the keys of an ordinary push.
function callFields (data: PushData, call: PushCallData): Record<string, string | number | undefined> {
  return {
    kind: CALL_KIND,
    inviteId: call.inviteId,
    meetingId: call.meetingId,
    roomId: call.roomId,
    callerName: call.callerName,
    callerPerson: call.callerPerson,
    expiresAt: call.expiresAt,
    url: data.url,
    domain: data.domain,
    tag: data.tag,
    objectId: data.objectId,
    objectClass: data.objectClass,
    createdOn: data.createdOn
  }
}

export function apnsVoipPayload (data: PushData, call: PushCallData): Record<string, unknown> {
  return Object.fromEntries(Object.entries(callFields(data, call)).filter(([, value]) => value !== undefined))
}

export function apnsCallCancelPayload (inviteId: string): Record<string, unknown> {
  return { aps: { 'content-available': 1 }, kind: CALL_CANCEL_KIND, inviteId }
}

// An alert, not a silent push: iOS throttles `content-available` alone. `apns-collapse-id`
// makes the tag the notification's identifier on the device, so a dismiss can name it.
export async function sendApns (token: string, data: PushData): Promise<Delivery> {
  return await apnsRequest(
    token,
    {
      'apns-push-type': 'alert',
      'apns-priority': '10',
      ...(data.tag !== undefined ? { 'apns-collapse-id': data.tag } : {})
    },
    apnsAlertPayload(data)
  )
}

// A background push, priority 5: iOS delivers it when it sees fit, never to a force-quit app.
export async function sendApnsDismiss (token: string, data: PushDismissData | PushDismissAllData): Promise<Delivery> {
  return await apnsRequest(
    token,
    { 'apns-push-type': 'background', 'apns-priority': '5' },
    data.kind === 'dismiss-all' ? apnsDismissAllPayload(data) : apnsDismissPayload(data)
  )
}

// PushKit wants its own topic; Apple drops the push once the call is over.
export async function sendApnsVoip (token: string, data: PushData, call: PushCallData): Promise<Delivery> {
  return await apnsRequest(
    token,
    {
      'apns-push-type': 'voip',
      'apns-priority': '10',
      'apns-topic': `${config.ApnsTopic}.voip`,
      'apns-expiration': String(Math.floor(call.expiresAt / 1000))
    },
    apnsVoipPayload(data, call)
  )
}

// Never on VoIP: a VoIP push must become a call, so a cancel goes the background way and may lag.
export async function sendApnsCallCancel (token: string, inviteId: string): Promise<Delivery> {
  return await apnsRequest(
    token,
    {
      'apns-push-type': 'background',
      'apns-priority': '5',
      'apns-expiration': String(Math.floor((Date.now() + CALL_RING_MS) / 1000))
    },
    apnsCallCancelPayload(inviteId)
  )
}

async function apnsRequest (
  token: string,
  headers: Record<string, string>,
  body: Record<string, unknown>
): Promise<Delivery> {
  const payload = JSON.stringify(body)

  return await new Promise<Delivery>((resolve) => {
    let request
    try {
      request = apnsConnect().request({
        [constants.HTTP2_HEADER_METHOD]: 'POST',
        [constants.HTTP2_HEADER_PATH]: `/3/device/${token}`,
        [constants.HTTP2_HEADER_AUTHORIZATION]: `bearer ${apnsAuth()}`,
        'apns-topic': config.ApnsTopic,
        'apns-expiration': String(Math.floor(Date.now() / 1000) + config.TTL),
        ...headers
      })
    } catch (err) {
      console.error('APNs request failed', err)
      resolve(Delivery.Error)
      return
    }

    let status = 0
    let responseBody = ''
    request.on('response', (responseHeaders) => {
      status = Number(responseHeaders[constants.HTTP2_HEADER_STATUS] ?? 0)
    })
    request.on('data', (chunk) => {
      responseBody += chunk
    })
    request.on('error', (err) => {
      console.error('APNs stream error', err)
      resolve(Delivery.Error)
    })
    request.on('end', () => {
      if (status === 200) {
        resolve(Delivery.Ok)
        return
      }
      // 410 is a token Apple has retired; the 400 reasons below mean it never
      // belonged here. Everything else may be transient, so the subscription stays.
      const dead = ['Unregistered', 'BadDeviceToken', 'DeviceTokenNotForTopic']
      resolve(status === 410 || dead.some((reason) => responseBody.includes(reason)) ? Delivery.Gone : Delivery.Error)
    })
    request.end(payload)
  })
}

// FCM authorizes with a service-account JWT exchanged for an access token; the
// legacy server key was switched off by Google in 2024.
let fcmToken: { value: string, expires: number } | undefined

interface ServiceAccount {
  project_id: string
  client_email: string
  private_key: string
}

function serviceAccount (): ServiceAccount {
  return JSON.parse(config.FcmServiceAccount as string)
}

async function fcmAuth (): Promise<string> {
  const now = Date.now()
  if (fcmToken !== undefined && now < fcmToken.expires) return fcmToken.value
  const account = serviceAccount()
  const issued = Math.floor(now / 1000)
  const assertion = jwt(
    { alg: 'RS256', typ: 'JWT' },
    {
      iss: account.client_email,
      scope: 'https://www.googleapis.com/auth/firebase.messaging',
      aud: 'https://oauth2.googleapis.com/token',
      iat: issued,
      exp: issued + 3600
    },
    account.private_key,
    'der'
  )
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion
    })
  })
  if (!response.ok) {
    throw new Error(`FCM token request failed: ${response.status} ${await response.text()}`)
  }
  const granted = await response.json()
  fcmToken = { value: granted.access_token, expires: now + (granted.expires_in - 60) * 1000 }
  return fcmToken.value
}

/**
 * `notification` rather than a data-only message on purpose: with it Android
 * draws the banner itself while the process is asleep, so nothing has to run
 * on the device for the push to arrive. FCM data values are strings only.
 */
export const sendTimeoutMs = 15000

function fcmData (values: Record<string, string | number | undefined>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(values)
      .filter((entry): entry is [string, string | number] => entry[1] !== undefined)
      .map(([key, value]) => [key, String(value)])
  )
}

// A background alert is drawn by the vendor SDK, which keeps none of `data` on the notification:
// the tag is all the app can read there. So it carries the workspace and the time besides the
// id, for a dismiss-all to tell which notifications it is about.
export function androidTag (data: PushData): string | undefined {
  if (data.tag === undefined || data.workspace === undefined || data.createdOn === undefined) return data.tag
  return `${data.workspace}|${data.createdOn}|${data.tag}`
}

export function fcmAlertMessage (token: string, data: PushData): Record<string, unknown> {
  return {
    token,
    notification: { title: data.title, body: data.body },
    data: fcmData({
      url: data.url,
      domain: data.domain,
      tag: data.tag,
      objectId: data.objectId,
      objectClass: data.objectClass,
      createdOn: data.createdOn,
      workspace: data.workspace
    }),
    android: { priority: 'HIGH', ttl: `${config.TTL}s`, notification: { tag: androidTag(data) } }
  }
}

export function fcmDismissMessage (token: string, data: PushDismissData): Record<string, unknown> {
  return {
    token,
    data: fcmData({
      kind: data.kind,
      objectId: data.objectId,
      objectClass: data.objectClass,
      tags: JSON.stringify(data.tags),
      readUpTo: data.readUpTo
    }),
    android: { priority: 'HIGH', ttl: `${config.TTL}s` }
  }
}

export function fcmDismissAllMessage (token: string, data: PushDismissAllData): Record<string, unknown> {
  return {
    token,
    data: fcmData({ kind: data.kind, workspace: data.workspace, readUpTo: data.readUpTo }),
    android: { priority: 'HIGH', ttl: `${config.TTL}s` }
  }
}

// Data-only, so the app draws the call screen itself; FCM drops it once the call is over.
export function fcmCallMessage (token: string, data: PushData, call: PushCallData): Record<string, unknown> {
  return { token, data: fcmData(callFields(data, call)), android: { priority: 'HIGH', ttl: callTtl(call) } }
}

export function fcmCallCancelMessage (token: string, inviteId: string): Record<string, unknown> {
  return {
    token,
    data: { kind: CALL_CANCEL_KIND, inviteId },
    android: { priority: 'HIGH', ttl: `${CALL_RING_MS / 1000}s` }
  }
}

function callTtl (call: PushCallData): string {
  return `${Math.max(0, Math.ceil((call.expiresAt - Date.now()) / 1000))}s`
}

export async function sendFcm (token: string, data: PushData): Promise<Delivery> {
  return await fcmRequest(fcmAlertMessage(token, data))
}

export async function sendFcmDismiss (token: string, data: PushDismissData | PushDismissAllData): Promise<Delivery> {
  return await fcmRequest(
    data.kind === 'dismiss-all' ? fcmDismissAllMessage(token, data) : fcmDismissMessage(token, data)
  )
}

export async function sendFcmCall (token: string, data: PushData, call: PushCallData): Promise<Delivery> {
  return await fcmRequest(fcmCallMessage(token, data, call))
}

export async function sendFcmCallCancel (token: string, inviteId: string): Promise<Delivery> {
  return await fcmRequest(fcmCallCancelMessage(token, inviteId))
}

async function fcmRequest (message: Record<string, unknown>): Promise<Delivery> {
  try {
    const account = serviceAccount()
    const response = await fetch(`https://fcm.googleapis.com/v1/projects/${account.project_id}/messages:send`, {
      method: 'POST',
      // The queue consumer waits for every push: a hung request must not stall it.
      signal: AbortSignal.timeout(sendTimeoutMs),
      headers: {
        Authorization: `Bearer ${await fcmAuth()}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ message })
    })
    if (response.ok) return Delivery.Ok
    const body = await response.text()
    // 404 is FCM's UNREGISTERED - the app was uninstalled or the token rotated.
    return response.status === 404 || body.includes('UNREGISTERED') || body.includes('INVALID_ARGUMENT')
      ? Delivery.Gone
      : Delivery.Error
  } catch (err) {
    console.error('FCM send failed', err)
    return Delivery.Error
  }
}

// RuStore's send API mirrors FCM's shape (same message/notification/data/android
// envelope, data values strings only) but authorizes with a static service token
// instead of a minted one.
export function rustoreAlertMessage (token: string, data: PushData): Record<string, unknown> {
  return {
    token,
    notification: { title: data.title, body: data.body },
    data: fcmData({
      url: data.url,
      domain: data.domain,
      tag: data.tag,
      objectId: data.objectId,
      objectClass: data.objectClass,
      createdOn: data.createdOn,
      workspace: data.workspace
    }),
    android: { ttl: `${config.TTL}s`, notification: { tag: androidTag(data) } }
  }
}

export function rustoreDismissMessage (token: string, data: PushDismissData): Record<string, unknown> {
  return {
    token,
    data: fcmData({
      kind: data.kind,
      objectId: data.objectId,
      objectClass: data.objectClass,
      tags: JSON.stringify(data.tags),
      readUpTo: data.readUpTo
    }),
    android: { ttl: `${config.TTL}s` }
  }
}

export function rustoreCallMessage (token: string, data: PushData, call: PushCallData): Record<string, unknown> {
  return { token, data: fcmData(callFields(data, call)), android: { ttl: callTtl(call) } }
}

export function rustoreCallCancelMessage (token: string, inviteId: string): Record<string, unknown> {
  return { token, data: { kind: CALL_CANCEL_KIND, inviteId }, android: { ttl: `${CALL_RING_MS / 1000}s` } }
}

export function rustoreDismissAllMessage (token: string, data: PushDismissAllData): Record<string, unknown> {
  return {
    token,
    data: fcmData({ kind: data.kind, workspace: data.workspace, readUpTo: data.readUpTo }),
    android: { ttl: `${config.TTL}s` }
  }
}

export async function sendRustore (token: string, data: PushData): Promise<Delivery> {
  return await rustoreRequest(rustoreAlertMessage(token, data))
}

export async function sendRustoreDismiss (token: string, data: PushDismissData | PushDismissAllData): Promise<Delivery> {
  return await rustoreRequest(
    data.kind === 'dismiss-all' ? rustoreDismissAllMessage(token, data) : rustoreDismissMessage(token, data)
  )
}

export async function sendRustoreCall (token: string, data: PushData, call: PushCallData): Promise<Delivery> {
  return await rustoreRequest(rustoreCallMessage(token, data, call))
}

export async function sendRustoreCallCancel (token: string, inviteId: string): Promise<Delivery> {
  return await rustoreRequest(rustoreCallCancelMessage(token, inviteId))
}

async function rustoreRequest (message: Record<string, unknown>): Promise<Delivery> {
  try {
    const response = await fetch(
      `https://vkpns.rustore.ru/v1/projects/${config.RustoreProjectId as string}/messages:send`,
      {
        method: 'POST',
        // The queue consumer waits for every push: a hung request must not stall it.
        signal: AbortSignal.timeout(sendTimeoutMs),
        headers: {
          Authorization: `Bearer ${config.RustoreServiceToken as string}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ message })
      }
    )
    if (response.ok) return Delivery.Ok
    const body = await response.text()
    // 404/UNREGISTERED/NOT_FOUND is RuStore's dead-token answer - the app was
    // uninstalled or the token rotated.
    return response.status === 404 || body.includes('UNREGISTERED') || body.includes('NOT_FOUND')
      ? Delivery.Gone
      : Delivery.Error
  } catch (err) {
    console.error('RuStore send failed', err)
    return Delivery.Error
  }
}
