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

import { type Markup, type Ref, type TxOperations } from '@hcengineering/core'

import chunter, { type Channel, type ChatMessage } from '.'

/** Post a chat message into a channel, same call as the channel message input. */
export async function postMessage (client: TxOperations, channel: Channel, message: Markup): Promise<Ref<ChatMessage>> {
  return await client.addCollection(chunter.class.ChatMessage, channel._id, channel._id, channel._class, 'messages', {
    message
  })
}
