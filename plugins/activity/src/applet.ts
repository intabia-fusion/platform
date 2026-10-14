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

import type { AttachedDoc, Class, Client, Doc, Ref, Space, TxOperations } from '@hcengineering/core'
import type { Asset, IntlString, Resource } from '@hcengineering/platform'
import type { AnyComponent } from '@hcengineering/ui/src/types'
import type { ActivityMessage } from './index'
import type { Poll } from './poll'

/**
 * @public
 */
export type AppletGetTitleFn = (instance: AppletSnapshot) => string
export type AppletGetTitleFnResource = Resource<AppletGetTitleFn>

export type CreateAppletClient = TxOperations & Client
/**
 * @public
 */
export type AppletCreateFn<P extends Record<string, any> = Record<string, any>> = (
  client: CreateAppletClient,
  attachedTo: Ref<ActivityMessage>,
  attachedToClass: Ref<Class<ActivityMessage>>,
  space: Ref<Space>,
  params: P
) => Promise<Ref<AppletInstance>>
export type AppletCreateFnResource = Resource<AppletCreateFn>

/**
 * @public
 */
export interface Applet extends Doc {
  label: IntlString
  pluralLabel: IntlString
  icon: Asset

  component: AnyComponent
  /** Rendered for a draft in the message input */
  previewComponent: AnyComponent
  createLabel: IntlString
  editLabel: IntlString
  createComponent: AnyComponent

  getTitleFn: AppletGetTitleFnResource
  createFn?: AppletCreateFnResource

  /** Whether the author may change an instance once its message is sent */
  editable: boolean
}

/**
 * @public
 */
export interface AppletInstance extends AttachedDoc<ActivityMessage, 'applets'> {
  applet: Ref<Applet>
}

/**
 * @public
 */
export interface AppletDraft<P extends Record<string, any> = Record<string, any>> {
  id: string
  appletId: Ref<Applet>
  params: P
}

/**
 * A copy for a forwarded message or a notification: no message fields, voters or quiz answer.
 * @public
 */
export type AppletSnapshot = Omit<AppletInstance, 'attachedTo' | 'attachedToClass' | 'space'>

/**
 * @public
 */
export function toAppletSnapshot (applet: AppletInstance): AppletSnapshot {
  const { space, attachedTo, attachedToClass, userVotes, quizAnswer, quizAnswerHash, ...rest } = applet as Poll
  return rest
}

/**
 * What the inbox shows of an applet, its title: a notification is copied to every receiver.
 * @public
 */
export function toAppletSummary (applet: AppletInstance): AppletSnapshot {
  const { options, votes, totalVotes, ...rest } = toAppletSnapshot(applet) as Poll
  return rest
}
