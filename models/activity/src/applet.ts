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
  type AppletGetSummaryFnResource,
  type AppletCreateFnResource,
  type AppletCanInteractResource,
  type ActivityMessage
} from '@hcengineering/activity'
import core, { DOMAIN_MODEL, type Domain, type Ref } from '@hcengineering/core'
import { Hidden, Model, Prop, TypeIntlString, TypeRecord, TypeRef, TypeString } from '@hcengineering/model'
import { TAttachedDoc, TDoc } from '@hcengineering/model-core'
import { type Asset, type IntlString } from '@hcengineering/platform'
import { type AnyComponent } from '@hcengineering/ui/src/types'

export const DOMAIN_APPLET = 'applet' as Domain

@Model(activity.class.Applet, core.class.Doc, DOMAIN_MODEL)
export class TApplet extends TDoc implements Applet {
  @Prop(TypeString(), activity.string.Type)
    type!: string

  @Prop(TypeIntlString(), activity.string.Label)
    label!: IntlString

  @Prop(TypeRecord(), activity.string.Icon)
    icon!: Asset

  @Prop(TypeIntlString(), activity.string.Description)
    description?: IntlString

  component!: AnyComponent
  previewComponent!: AnyComponent
  createLabel!: IntlString
  editLabel!: IntlString
  createComponent!: AnyComponent

  getTitleFn!: AppletGetTitleFnResource
  getSummaryFn?: AppletGetSummaryFnResource
  createFn?: AppletCreateFnResource
  canInteractFn?: AppletCanInteractResource
}

@Model(activity.class.AppletInstance, core.class.AttachedDoc, DOMAIN_APPLET)
export class TAppletInstance extends TAttachedDoc implements AppletInstance {
  @Prop(TypeRef(activity.class.ActivityMessage), core.string.AttachedTo)
  declare attachedTo: Ref<ActivityMessage>

  @Prop(TypeRef(activity.class.Applet), activity.string.Applet)
    applet!: Ref<Applet>

  @Prop(TypeString(), core.string.Collection)
  @Hidden()
  override collection: 'applets' = 'applets'
}
