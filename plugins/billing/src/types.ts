//
// Copyright © 2025 Hardcore Engineering Inc.
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

import { Doc } from '@hcengineering/core'
import { IntlString } from '@hcengineering/platform'

/** @public */
export interface Tier extends Doc {
  label: IntlString
  description: IntlString
  priceMonthly: number
  storageLimitGB: number
  trafficLimitGB: number
  meetingMinutesLimit: number // In minutes
  tokenLimit: number // In thousands of tokens

  // AI token package multiplier (xN). A purchasable package scales the effective AI
  // token limits — both the rolling windows (5h/week) and the overall monthly limit.
  // Default 1 = no effect. Enforcement of the scaled limit is applied where windows
  // are computed (billing); wire the actual purchase flow when billing supports it.
  tokenPackageMultiplier?: number

  index: number
  color?: string
}
