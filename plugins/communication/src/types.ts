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

import { AppletAttachment, AppletParams, AppletType, Message, MessageID } from '@hcengineering/communication-types'
import { Class, Configuration, Doc, Ref } from '@hcengineering/core'
import { Asset, IntlString, Resource } from '@hcengineering/platform'
import { AnyComponent } from '@hcengineering/ui'

export * from './poll'
export * from './direct'
export * from './thread'

export type MessageActionFunction = (
  message: Message,
  doc: Doc,
  evt?: Event,
  onOpen?: () => void,
  onClose?: () => void
) => Promise<void>
export type MessageActionFunctionResource = Resource<MessageActionFunction>

export type MessageActionVisibilityTester = (message: Message) => boolean
export type MessageActionVisibilityTesterResource = Resource<MessageActionVisibilityTester>

export interface MessageAction extends Doc {
  label: IntlString
  icon: Asset
  action: MessageActionFunctionResource
  visibilityTester?: MessageActionVisibilityTesterResource

  order: number
  menu?: boolean
}

export interface CustomActivityPresenter extends Doc {
  attribute: string
  component: AnyComponent
  _class: Ref<Class<Doc>>
}

export interface Applet extends Doc {
  type: AppletType
  icon: Asset
  label: IntlString
  component: AnyComponent
  createLabel: IntlString
  createComponent: AnyComponent
  previewComponent: AnyComponent
  getTitleFn: AppletGetTitleFnResource
  createFn?: AppletCreateFnResource
}

export type AppletCreateFn = (parent: Doc, message: MessageID, params: AppletParams) => Promise<void>
export type AppletCreateFnResource = Resource<AppletCreateFn>

export type AppletGetTitleFn = (attachment: AppletAttachment) => string
export type AppletGetTitleFnResource = Resource<AppletGetTitleFn>

export interface GuestCommunicationSettings extends Configuration {
  // TODO: FIXME
  allowedCards: Ref<Doc>[]
}
