//
// Copyright © 2020 Anticrm Platform Contributors.
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

import {
  AccountRole,
  type AccountUuid,
  type Class,
  DOMAIN_MODEL,
  type Ref,
  type Space,
  type Timestamp
} from '@hcengineering/core'
import { type Builder, Mixin, Model, Prop, TypeRef, UX } from '@hcengineering/model'
import preference, { TPreference } from '@hcengineering/model-preference'
import { createAction } from '@hcengineering/model-view'
import core, { TClass, TDoc } from '@hcengineering/model-core'
import { type Asset, getEmbeddedLabel, type IntlString, type Resource } from '@hcengineering/platform'
import view, { type KeyBinding } from '@hcengineering/view'
import { WidgetType } from '@hcengineering/workbench'
import type {
  Application,
  ApplicationNavModel,
  HiddenApplication,
  OnboardingAction,
  OnboardingCard,
  OnboardingCardDoneWhen,
  OnboardingPreference,
  SpaceView,
  ViewConfiguration,
  Widget,
  WidgetPreference,
  WidgetTab,
  WorkbenchTab
} from '@hcengineering/workbench'
import { type AnyComponent } from '@hcengineering/ui/src/types'
import presentation from '@hcengineering/model-presentation'

import workbench from './plugin'

export { workbenchId } from '@hcengineering/workbench'
export { workbenchOperation } from './migration'
export type { Application, Widget, OnboardingCard }
export { WidgetType } from '@hcengineering/workbench'

@Model(workbench.class.Application, core.class.Doc, DOMAIN_MODEL)
@UX(workbench.string.Application)
export class TApplication extends TDoc implements Application {
  label!: IntlString
  icon!: Asset
  alias!: string
  position?: 'top' | 'mid'
  hidden!: boolean
  accessLevel?: AccountRole
  order?: number
}

@Model(workbench.class.ApplicationNavModel, core.class.Doc, DOMAIN_MODEL)
@UX(workbench.string.Application)
export class TApplicationNavModel extends TDoc implements ApplicationNavModel {
  extends!: Ref<Application>
}

@Model(workbench.class.HiddenApplication, preference.class.Preference)
export class THiddenApplication extends TPreference implements HiddenApplication {
  @Prop(TypeRef(workbench.class.Application), workbench.string.HiddenApplication)
  declare attachedTo: Ref<Application>
}

@Mixin(workbench.mixin.SpaceView, core.class.Class)
export class TSpaceView extends TClass implements SpaceView {
  view!: ViewConfiguration
}

@Model(workbench.class.Widget, core.class.Doc, DOMAIN_MODEL)
@UX(workbench.string.Widget)
export class TWidget extends TDoc implements Widget {
  label!: IntlString
  icon!: Asset
  type!: WidgetType

  component!: AnyComponent
  tabComponent?: AnyComponent
  switcherComponent?: AnyComponent
  headerLabel?: IntlString

  closeIfNoTabs?: boolean
  onTabClose?: Resource<(tab: WidgetTab) => Promise<void>>
}

@Model(workbench.class.WidgetPreference, preference.class.Preference)
@UX(workbench.string.WidgetPreference)
export class TWidgetPreference extends TPreference implements WidgetPreference {
  @Prop(TypeRef(workbench.class.Widget), workbench.string.WidgetPreference)
  declare attachedTo: Ref<Widget>

  enabled!: boolean
}

@Model(workbench.class.WorkbenchTab, preference.class.Preference)
@UX(workbench.string.Tab)
export class TWorkbenchTab extends TPreference implements WorkbenchTab {
  declare attachedTo: AccountUuid
  location!: string
  name?: string
  isPinned!: boolean
}

@Model(workbench.class.OnboardingCard, core.class.Doc, DOMAIN_MODEL)
export class TOnboardingCard extends TDoc implements OnboardingCard {
  application?: Ref<Application>
  label!: IntlString
  description!: IntlString
  category!: IntlString
  order!: number
  actions!: OnboardingAction[]
  accessLevel?: AccountRole
  doneWhen?: OnboardingCardDoneWhen
  screenshots?: IntlString[]
}

@Model(workbench.class.OnboardingPreference, preference.class.Preference)
export class TOnboardingPreference extends TPreference implements OnboardingPreference {
  showHints!: boolean
  completed!: Array<Ref<OnboardingCard>>
  skipped?: Array<Ref<OnboardingCard>>
  startedAt?: Timestamp
  cancelled?: boolean
  progress!: Record<string, Timestamp>
}

export function createModel (builder: Builder): void {
  builder.createModel(
    TApplication,
    TSpaceView,
    THiddenApplication,
    TApplicationNavModel,
    TWidget,
    TWidgetPreference,
    TWorkbenchTab,
    TOnboardingCard,
    TOnboardingPreference
  )

  builder.mixin(workbench.class.WorkbenchTab, core.class.Class, core.mixin.TxAccessLevel, {
    createAccessLevel: AccountRole.Guest,
    removeAccessLevel: AccountRole.Guest,
    updateAccessLevel: AccountRole.Guest
  })

  // Per-account preference, same access pattern as DesktopNotificationPreference.
  builder.mixin(workbench.class.OnboardingPreference, core.class.Class, core.mixin.TxAccessLevel, {
    createAccessLevel: AccountRole.Guest,
    updateAccessLevel: AccountRole.Guest,
    removeAccessLevel: AccountRole.Guest
  })

  builder.mixin(workbench.class.Application, core.class.Class, view.mixin.ObjectPresenter, {
    presenter: workbench.component.ApplicationPresenter
  })

  builder.mixin(workbench.class.Application, core.class.Class, view.mixin.IgnoreActions, {
    actions: [view.action.Delete]
  })

  // Client-side statistics of the current session, available to everyone
  createAction(builder, {
    action: view.actionImpl.ShowPopup,
    actionProps: {
      component: workbench.component.ServerManager,
      element: 'content'
    },
    label: getEmbeddedLabel('Client statistics'),
    icon: view.icon.Configure,
    input: 'none',
    category: view.category.General,
    target: core.class.Doc,
    context: {
      mode: ['workbench']
    }
  })

  createAction(builder, {
    action: workbench.actionImpl.PinTab,
    label: view.string.Pin,
    icon: view.icon.Pin,
    input: 'focus',
    category: workbench.category.Workbench,
    target: workbench.class.WorkbenchTab,
    query: {
      isPinned: false
    },
    context: {
      mode: 'context',
      group: 'edit'
    }
  })

  createAction(builder, {
    action: workbench.actionImpl.UnpinTab,
    label: view.string.Unpin,
    icon: view.icon.Pin,
    input: 'focus',
    category: workbench.category.Workbench,
    target: workbench.class.WorkbenchTab,
    query: {
      isPinned: true
    },
    context: {
      mode: 'context',
      group: 'edit'
    }
  })

  createAction(builder, {
    action: workbench.actionImpl.CloseTab,
    label: presentation.string.Close,
    icon: view.icon.Delete,
    input: 'focus',
    category: workbench.category.Workbench,
    target: workbench.class.WorkbenchTab,
    visibilityTester: workbench.function.CanCloseTab,
    context: {
      mode: 'context',
      group: 'edit'
    }
  })

  createAction(
    builder,
    {
      action: workbench.actionImpl.CloseCurrentTab,
      label: presentation.string.Close,
      icon: view.icon.Delete,
      input: 'none',
      category: workbench.category.Workbench,
      allowedForEditableContent: 'always',
      target: core.class.Doc,
      context: { mode: ['workbench', 'browser', 'panel', 'editor', 'input'] }
    },
    workbench.action.CloseCurrentTab
  )

  builder.createDoc(
    workbench.class.Widget,
    core.space.Model,
    {
      label: view.string.Open,
      type: WidgetType.Flexible,
      icon: view.icon.Open,
      closeIfNoTabs: true,
      component: view.component.SidebarPreviewWidget
    },
    view.ids.PreviewWidget as Ref<Widget>
  )

  builder.createDoc(
    workbench.class.OnboardingCard,
    core.space.Model,
    {
      label: workbench.string.OnboardingInviteTeam,
      description: workbench.string.OnboardingInviteTeamDescription,
      category: workbench.string.OnboardingCategoryBasics,
      order: 10,
      accessLevel: AccountRole.User,
      screenshots: [workbench.string.OnboardingInviteStep1, workbench.string.OnboardingInviteStep2],
      actions: [
        {
          // models/workbench has no dependency on setting and login: same keys as the account menu item.
          label: 'setting:string:InviteWorkspace' as IntlString,
          component: 'login:component:InviteLink' as AnyComponent
        }
      ]
    },
    workbench.ids.OnboardingInviteCard
  )

  builder.createDoc(
    workbench.class.OnboardingCard,
    core.space.Model,
    {
      label: workbench.string.OnboardingAppearance,
      description: workbench.string.OnboardingAppearanceDescription,
      category: workbench.string.OnboardingCategoryBasics,
      order: 12,
      screenshots: [workbench.string.OnboardingAppearanceStep1, workbench.string.OnboardingAppearanceStep2],
      actions: [
        {
          label: workbench.string.OnboardingOpenAppearance,
          target: { selector: '#statusbar-settings' }
        }
      ]
    },
    workbench.ids.OnboardingAppearanceCard
  )

  builder.createDoc(
    workbench.class.OnboardingCard,
    core.space.Model,
    {
      label: workbench.string.OnboardingSearch,
      description: workbench.string.OnboardingSearchDescription,
      category: workbench.string.OnboardingCategoryBasics,
      order: 17,
      screenshots: [workbench.string.OnboardingSearchStep1, workbench.string.OnboardingSearchStep2],
      actions: [
        {
          label: workbench.string.OnboardingOpenSearch,
          target: { selector: '#statusbar-search' }
        }
      ]
    },
    workbench.ids.OnboardingSearchCard
  )

  // Last step: where help lives, including "take the tour again".
  builder.createDoc(
    workbench.class.OnboardingCard,
    core.space.Model,
    {
      label: workbench.string.OnboardingHelpCenter,
      description: workbench.string.OnboardingHelpCenterDescription,
      category: workbench.string.OnboardingCategoryBasics,
      order: 1000,
      screenshots: [workbench.string.OnboardingInviteStep1, workbench.string.OnboardingHelpCenterStep2],
      actions: [
        {
          label: workbench.string.OnboardingOpenAccountMenu,
          target: { selector: '[data-id="profile-button"]' }
        }
      ]
    },
    workbench.ids.OnboardingHelpCenterCard
  )
}

export default workbench

export function createNavigateAction (
  builder: Builder,
  key: KeyBinding,
  label: IntlString,
  application: Ref<Application>,
  props: {
    mode: 'app' | 'special' | 'space'
    application?: string
    special?: string
    space?: Ref<Space>
    spaceClass?: Ref<Class<Space>>
    spaceSpecial?: string
    query?: Record<string, string | null>
  }
): void {
  createAction(builder, {
    action: workbench.actionImpl.Navigate,
    actionProps: props,
    label,
    icon: view.icon.ArrowRight,
    keyBinding: [key],
    input: 'none',
    category: view.category.Navigation,
    target: core.class.Doc,
    context: {
      mode: ['workbench', 'browser', 'editor', 'panel', 'popup'],
      application
    }
  })
}
