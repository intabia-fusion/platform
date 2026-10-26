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

export type AppletGetTitleFn = (instance: AppletSnapshot) => string
export type AppletGetTitleFnResource = Resource<AppletGetTitleFn>

export type CreateAppletClient = TxOperations & Client

export type AppletCreateFn<P extends Record<string, any> = Record<string, any>> = (
  client: CreateAppletClient,
  attachedTo: Ref<ActivityMessage>,
  attachedToClass: Ref<Class<ActivityMessage>>,
  space: Ref<Space>,
  params: P
) => Promise<Ref<AppletInstance>>
export type AppletCreateFnResource = Resource<AppletCreateFn>

export interface Applet extends Doc {
  label: IntlString
  pluralLabel: IntlString
  icon: Asset
  /** Outlined icon of the message input button, as the other actions there; `icon` if absent */
  actionIcon?: Asset
  /** Platform palette color name (`getPlatformColorByName`) of the draft icon plate */
  color?: string

  component: AnyComponent
  previewComponent: AnyComponent
  createLabel: IntlString
  editLabel: IntlString
  createComponent: AnyComponent

  getTitleFn: AppletGetTitleFnResource
  createFn?: AppletCreateFnResource

  editable: boolean

  /** Fields a forwarded copy keeps, since it is shown in another space */
  snapshotFields: string[]
  /** Fields a notification keeps for the inbox preview and the push text */
  summaryFields: string[]
  /** Classes attached to an instance by `attachedTo`, removed with it */
  dependents?: Array<Ref<Class<Doc>>>
}

export interface AppletInstance extends AttachedDoc<ActivityMessage, 'applets'> {
  applet: Ref<Applet>
}

export interface AppletDraft<P extends Record<string, any> = Record<string, any>> {
  id: string
  appletId: Ref<Applet>
  params: P
}

export type AppletSnapshot = Omit<AppletInstance, 'attachedTo' | 'attachedToClass' | 'space'>

// A list of allowed fields: a secret field of a new kind stays out by default.
function pickAppletFields (instance: AppletInstance, fields: string[] = []): AppletSnapshot {
  const result: Record<string, any> = {}
  const base = ['_id', '_class', 'applet', 'collection', 'modifiedOn', 'modifiedBy', 'createdOn', 'createdBy']
  for (const field of [...base, ...fields]) {
    const value = (instance as any)[field]
    if (value !== undefined) result[field] = value
  }
  return result as AppletSnapshot
}

export function toAppletSnapshot (instance: AppletInstance, applet: Applet | undefined): AppletSnapshot {
  return pickAppletFields(instance, applet?.snapshotFields)
}

export function toAppletSummary (instance: AppletInstance, applet: Applet | undefined): AppletSnapshot {
  return pickAppletFields(instance, applet?.summaryFields)
}
