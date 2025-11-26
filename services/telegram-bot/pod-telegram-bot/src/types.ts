//
// Copyright © 2024 Hardcore Engineering Inc.
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

import { AccountUuid, Class, Doc, Ref, WorkspaceUuid } from '@hcengineering/core'
import { Integration } from '@hcengineering/account-client'

export type ChannelId = string & { __channelId: true }

export interface MessageRecord {
  workspace: WorkspaceUuid
  account: AccountUuid
  // TODO: FIXME
  messageId: any
  telegramMessageId: number
}

export interface ChannelRecord {
  rowId: ChannelId
  workspace: WorkspaceUuid
  // TODO: FIXME
  _id: Ref<Doc>
  _class: Ref<Class<Doc>>
  name: string
  account: AccountUuid
}

export interface ReplyRecord {
  // TODO: FIXME
  messageId: any
  telegramUserId: number
  replyId: number
}

export interface OtpRecord {
  telegramId: number
  telegramUsername: string
  code: string
  expires: Date
  createdAt: Date
}

export interface PlatformFileInfo {
  filename: string
  type: string
  buffer: Buffer
}

export interface TelegramFileInfo {
  type: string
  url: string
  width: number
  height: number
  name?: string
  size?: number
}

export interface WorkspaceInfo {
  url: string
  id: string
  name: string
}

export type IntegrationInfo = Integration & {
  account: AccountUuid
  workspaceUuid: WorkspaceUuid
  telegramId: number
  username?: string
}
