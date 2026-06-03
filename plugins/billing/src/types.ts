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

/** @public */
export type LocalizedString = string | Record<string, string>

/** @public */
export interface PlanItem {
  label: LocalizedString
  description: LocalizedString
  users: LocalizedString
  features: LocalizedString[]
  additional: LocalizedString
  priceMonthly: number
  currency: string
  storageLimitGB: number
  trafficLimitGB: number
  meetingMinutesLimit: number
  tokenLimit: number
  projectsLimit: number
  // Reserved space limits — schema supports them, not enforced yet (0/undefined = unlimited).
  drivesLimit?: number
  teamspacesLimit?: number
  usersLimit: number
  index: number
  color?: string
}

/** @public */
export interface PackageItem {
  description: LocalizedString
  priceMonthly: string
  currency: string
  eligiblePlans: string[]
  storageLimitGB: number
}

/** @public */
export interface PlanConfig {
  plans: Record<string, PlanItem>
  packages: Record<string, PackageItem>
}
