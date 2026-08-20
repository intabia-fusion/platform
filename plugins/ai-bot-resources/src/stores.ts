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

import { derived, writable } from 'svelte/store'
import { deviceOptionsStore } from '@hcengineering/ui'

import { type AITaskProposalMessage } from '@hcengineering/ai-bot'

/**
 * Whether there is room for the assistant beside the create dialog. `isMobile` alone is not enough:
 * it comes from the device, so a narrow window on a desktop still reports false while the dialog
 * plus a conversation no longer fit. Below this the toggle is hidden too - a button that opens a
 * panel with nowhere to go only crowds an already tight header.
 */
export const ASSIST_MIN_WIDTH = 768

export const issueAssistFits = derived(
  deviceOptionsStore,
  (device) => !device.isMobile && device.docWidth > ASSIST_MIN_WIDTH
)

/**
 * Whether the create-issue assistant panel is open. The toggle sits in the dialog header and the
 * panel in the card's aside slot — two extension points, so the state lives outside both.
 */
export const issueAssistOpened = writable(false)

/**
 * Applies a proposal to the create-issue form. Registered by the assistant panel while it is
 * open; the proposal card calls it, so "apply" sits on the card itself and not in a separate bar.
 */
export const issueDraftApplier = writable<((proposal: AITaskProposalMessage) => void) | undefined>(undefined)
