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
export { type PlanLimits, type LimitsProvider, type SpaceCountsProvider } from '@hcengineering/server-core'

/** contextVars key: PlanLimits snapshot for current workspace. */
export const PLAN_LIMITS_VAR = 'planLimits'
/** contextVars key: boolean payment-exhausted flag for current workspace. */
export const PAYMENT_EXHAUSTED_VAR = 'paymentExhausted'
/** contextVars key: injected LimitsProvider instance. */
export const LIMITS_PROVIDER_VAR = 'limitsProvider'
/** contextVars key: shared Map<WorkspaceUuid, boolean> of payment-exhausted workspaces (updated live by host consumer). */
export const PAYMENT_EXHAUSTED_MAP_KEY = 'paymentExhaustedMap'
/** contextVars key: shared Map<WorkspaceUuid, PlanLimits> refreshed live by host consumer on plan changes. */
export const PLAN_LIMITS_MAP_KEY = 'planLimitsMap'
/** contextVars key: SpaceCountsProvider registered by SpaceSecurityMiddleware, pulled by PlanLimitsMiddleware. */
export const SPACE_COUNTS_PROVIDER_KEY = 'spaceCountsProvider'
