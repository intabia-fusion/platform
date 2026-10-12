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

import activity, {
  type Applet,
  type AppletInstance,
  type AppletGetTitleFnResource,
  type AppletCreateFnResource,
  type ActivityMessage
} from '@hcengineering/activity'
import core, { DOMAIN_MODEL, type Domain, IndexKind, type Ref } from '@hcengineering/core'
import { Hidden, Index, Model, Prop, TypeRef, TypeString } from '@hcengineering/model'
import { TAttachedDoc, TDoc } from '@hcengineering/model-core'
import { type Asset, type IntlString } from '@hcengineering/platform'
import { type AnyComponent } from '@hcengineering/ui/src/types'

export const DOMAIN_APPLET = 'applet' as Domain

@Model(activity.class.Applet, core.class.Doc, DOMAIN_MODEL)
export class TApplet extends TDoc implements Applet {
  label!: IntlString
  pluralLabel!: IntlString
  icon!: Asset
  component!: AnyComponent
  previewComponent!: AnyComponent
  createLabel!: IntlString
  editLabel!: IntlString
  createComponent!: AnyComponent

  getTitleFn!: AppletGetTitleFnResource
  createFn?: AppletCreateFnResource
  editable!: boolean
}

@Model(activity.class.AppletInstance, core.class.AttachedDoc, DOMAIN_APPLET)
export class TAppletInstance extends TAttachedDoc implements AppletInstance {
  // The override drops the index of AttachedDoc, a full-text hit maps to its message by it.
  @Prop(TypeRef(activity.class.ActivityMessage), core.string.AttachedTo)
  @Index(IndexKind.Indexed)
  declare attachedTo: Ref<ActivityMessage>

  @Prop(TypeRef(activity.class.Applet), activity.string.Applet)
  applet!: Ref<Applet>

  @Prop(TypeString(), core.string.Collection)
  @Hidden()
  override collection: 'applets' = 'applets'
}
