//
// Copyright © 2023 Hardcore Engineering Inc.
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

interface Config {
  Port: number
  Source: string
  AuthToken?: string
  PushSubject?: string
  PushPublicKey?: string
  PushPrivateKey?: string

  // APNs: a .p8 key from a paid Apple team; free provisioning issues no push
  // entitlement. ApnsTopic is the app bundle id.
  ApnsKeyId?: string
  ApnsTeamId?: string
  ApnsKey?: string
  ApnsTopic?: string
  ApnsProduction: boolean

  // FCM: the service-account JSON, verbatim.
  FcmServiceAccount?: string

  TTL: number
}

const envMap: { [key in keyof Required<Config>]: string } = {
  Port: 'PORT',
  Source: 'SOURCE',
  AuthToken: 'AUTH_TOKEN',
  PushPublicKey: 'PUSH_PUBLIC_KEY',
  PushPrivateKey: 'PUSH_PRIVATE_KEY',
  PushSubject: 'PUSH_SUBJECT',
  ApnsKeyId: 'APNS_KEY_ID',
  ApnsTeamId: 'APNS_TEAM_ID',
  ApnsKey: 'APNS_KEY',
  ApnsTopic: 'APNS_TOPIC',
  ApnsProduction: 'APNS_PRODUCTION',
  FcmServiceAccount: 'FCM_SERVICE_ACCOUNT',
  TTL: 'TTL'
}

const parseNumber = (str: string | undefined): number | undefined => (str !== undefined ? Number(str) : undefined)

const config: Config = (() => {
  const params: Partial<Config> = {
    Port: parseNumber(process.env[envMap.Port]) ?? 8091,
    Source: process.env[envMap.Source],
    AuthToken: process.env[envMap.AuthToken],
    PushPublicKey: process.env[envMap.PushPublicKey],
    PushPrivateKey: process.env[envMap.PushPrivateKey],
    PushSubject: process.env[envMap.PushSubject],
    ApnsKeyId: process.env[envMap.ApnsKeyId],
    ApnsTeamId: process.env[envMap.ApnsTeamId],
    // The .p8 body travels through env, where a real newline cannot: \n is the
    // usual way to carry a PEM, and createPrivateKey needs it restored.
    ApnsKey: process.env[envMap.ApnsKey]?.replace(/\\n/g, '\n'),
    ApnsTopic: process.env[envMap.ApnsTopic],
    ApnsProduction: process.env[envMap.ApnsProduction] !== 'false',
    FcmServiceAccount: process.env[envMap.FcmServiceAccount],
    TTL: parseNumber(process.env[envMap.TTL] ?? '3600') // default to 1 hour
  }

  const required: Array<keyof Config> = ['Port', 'Source']

  const missingEnv = required.filter((key) => params[key] === undefined).map((key) => envMap[key])

  if (missingEnv.length > 0) {
    throw Error(`Missing env variables: ${missingEnv.join(', ')}`)
  }

  return params as Config
})()

export default config
