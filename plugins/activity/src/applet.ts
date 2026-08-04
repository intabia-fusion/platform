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

import { AttachedDoc, Class, Client, Doc, Ref, Space, TxOperations } from '@hcengineering/core'
import type { Asset, IntlString, Resource } from '@hcengineering/platform'
import type { AnyComponent } from '@hcengineering/ui/src/types'
import { ActivityMessage } from './index'

/**
 * Resource to compute text title for an applet instance.
 * @public
 */
export type AppletGetTitleFn = (instance: AppletInstance) => string
export type AppletGetTitleFnResource = Resource<AppletGetTitleFn>

/**
 * Resource to compute plain-text summary for push notifications & search indexing.
 * @public
 */
export type AppletGetSummaryFn = (instance: AppletInstance) => string
export type AppletGetSummaryFnResource = Resource<AppletGetSummaryFn>

/**
 * Resource to check if current account can perform an action on an applet instance.
 * @public
 */
export type AppletCanInteractResource = Resource<(instance: AppletInstance, action: string) => boolean>

export type CreateAppletClient = TxOperations & Client
/**
 * Factory resource for custom creation logic.
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
 * Definition document for an interactive chat Applet (e.g. Poll, Map).
 * @public
 */
export interface Applet extends Doc {
  /** Unique Applet identifier, e.g. 'poll', 'location-map' */
  type: string

  /** Display metadata for chat attachment menu & slash commands */
  label: IntlString
  icon: Asset
  description?: IntlString

  // --- UI Components ---
  /** Rendered directly inside the message body in the chat stream */
  component: AnyComponent

  /** Rendered in reply quotes, hover previews, and message input attachment bar */
  previewComponent: AnyComponent

  /** Modal/form component opened when creating a new instance */
  createLabel: IntlString
  editLabel: IntlString
  createComponent: AnyComponent

  // --- Server Resources & Hooks ---
  /** Resource computing title for headers/tooltips */
  getTitleFn: AppletGetTitleFnResource

  /** Resource generating plain-text summary for notifications & search */
  getSummaryFn?: AppletGetSummaryFnResource

  /** Factory resource for custom creation logic */
  createFn?: AppletCreateFnResource

  /** Permission resource: verifies if current user can execute actions on the instance */
  canInteractFn?: AppletCanInteractResource
}

/**
 * Base document class for an interactive applet instance attached to an ActivityMessage.
 * @public
 */
export interface AppletInstance extends AttachedDoc<ActivityMessage, 'applets'> {
  /** Reference to the Applet definition */
  applet: Ref<Applet>
}

/**
 * Pending draft of an applet attachment before message creation.
 * @public
 */
export interface AppletDraft<P extends Record<string, any> = Record<string, any>> {
  id: string
  appletId: Ref<Applet>
  params: P
}
