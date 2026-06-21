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
import { config as dotenvConfig } from 'dotenv'

dotenvConfig()

export interface Config {
  Port: number
  Secret: string
  AccountsUrl: string
  FrontUrl: string
  CorsOrigin?: string // allowed CORS origin(s), comma-separated; unset -> open cors() (dev/test)

  // TBank configuration
  TbankTerminalKey: string
  TbankPassword: string
  TbankUrl: string
  TbankSubscriptionPlans: string // plan@type:amountInCents;...

  // Dev
  TbankSkipWebhookVerification?: boolean // Skip webhook token verification (for local dev with curl)

  // Scheduler
  SchedulerIntervalMinutes: number // How often to check for expiring subscriptions
  GracePeriodDays: number // Days after periodEnd a failed subscription stays in past_due before going readonly

  // Email notifications (optional — payment-failed emails are skipped when MailUrl is unset)
  MailUrl?: string // pod-mail base URL, e.g. http://mail:8097
  MailApiKey?: string // pod-mail API key (Bearer), optional if pod-mail has none
  MailFrom?: string // From address for outgoing notifications

  // pod-payment base URL — used to resolve localized plan labels for emails (optional; falls back to plan id)
  PaymentUrl?: string
}

const parseNumber = (str: string | undefined, defaultVal: number): number =>
  str !== undefined ? Number(str) : defaultVal

const config: Config = (() => {
  const params = {
    Port: parseNumber(process.env.PORT, 4042),
    Secret: process.env.SECRET,
    AccountsUrl: process.env.ACCOUNTS_URL,
    FrontUrl: process.env.FRONT_URL,
    CorsOrigin: process.env.CORS_ORIGIN,
    TbankTerminalKey: process.env.TBANK_TERMINAL_KEY,
    TbankPassword: process.env.TBANK_PASSWORD,
    TbankUrl: process.env.TBANK_URL,
    TbankSubscriptionPlans: process.env.TBANK_SUBSCRIPTION_PLANS,
    TbankSkipWebhookVerification: process.env.TBANK_SKIP_WEBHOOK_VERIFICATION === 'true',
    SchedulerIntervalMinutes: parseNumber(process.env.SCHEDULER_INTERVAL_MINUTES, 60),
    GracePeriodDays: parseNumber(process.env.GRACE_PERIOD_DAYS, 7),
    MailUrl: process.env.MAIL_URL,
    MailApiKey: process.env.MAIL_API_KEY,
    MailFrom: process.env.MAIL_FROM,
    PaymentUrl: process.env.PAYMENT_URL
  }

  const requiredKeys: Array<keyof Config> = [
    'Port',
    'Secret',
    'AccountsUrl',
    'FrontUrl',
    'TbankTerminalKey',
    'TbankPassword',
    'TbankUrl',
    'TbankSubscriptionPlans'
  ]

  const missingEnv = requiredKeys.filter((key) => params[key] === undefined)

  if (missingEnv.length > 0) {
    throw Error(`Missing config for attributes: ${missingEnv.join(', ')}`)
  }

  return params as Config
})()

export default config
