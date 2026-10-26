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

import activity, { type Applet } from '@hcengineering/activity'
import contact from '@hcengineering/contact'
import core, {
  ClassifierKind,
  type Class,
  type Data,
  type Doc,
  type Domain,
  DOMAIN_MODEL,
  DOMAIN_TX,
  type Obj,
  type Ref,
  type Tx,
  TxFactory
} from '@hcengineering/core'
import type { IntlString } from '@hcengineering/platform'
import presentation from '@hcengineering/presentation'

const factory = new TxFactory(core.account.System)

function createClass (
  _class: Ref<Class<Obj>>,
  extendsClass: Ref<Class<Obj>> | undefined,
  domain?: Domain,
  kind = ClassifierKind.CLASS
): Tx {
  const data: Data<Class<Obj>> = { label: _class as unknown as IntlString, extends: extendsClass, kind, domain }
  return factory.createTxCreateDoc(core.class.Class, core.space.Model, data, _class)
}

// Only the classes the poll components and their contact and view neighbours query.
export function buildModel (): Tx[] {
  const mixin = ClassifierKind.MIXIN
  return [
    createClass(core.class.Obj, undefined),
    createClass(core.class.Doc, core.class.Obj),
    createClass(core.class.Class, core.class.Doc, DOMAIN_MODEL),
    createClass(core.class.Mixin, core.class.Class, DOMAIN_MODEL),
    createClass(core.class.AttachedDoc, core.class.Doc),
    createClass(core.class.Space, core.class.Doc, 'space' as Domain),
    createClass(core.class.Tx, core.class.Doc, DOMAIN_TX),
    createClass(core.class.TxCUD, core.class.Tx, DOMAIN_TX),
    createClass(core.class.TxCreateDoc, core.class.TxCUD),
    createClass(core.class.TxUpdateDoc, core.class.TxCUD),
    createClass(core.class.TxRemoveDoc, core.class.TxCUD),
    createClass(core.class.TxMixin, core.class.TxCUD),
    createClass(core.class.TxApplyIf, core.class.Tx),
    createClass(core.class.UserStatus, core.class.Doc, 'user-status' as Domain),
    createClass(core.class.Status, core.class.Doc, 'status' as Domain),
    createClass(presentation.class.PresentationMiddlewareFactory, core.class.Doc, DOMAIN_MODEL),

    createClass(contact.class.Contact, core.class.Doc, 'contact' as Domain),
    createClass(contact.class.Person, contact.class.Contact),
    createClass(contact.mixin.Employee, contact.class.Person, undefined, mixin),
    createClass(contact.class.SocialIdentity, core.class.AttachedDoc, 'channel' as Domain),
    createClass(contact.class.AvatarProvider, core.class.Doc, DOMAIN_MODEL),
    createClass(contact.class.ChannelProvider, core.class.Doc, DOMAIN_MODEL),
    createClass(contact.class.PersonSpace, core.class.Space),

    createClass(activity.class.ActivityMessage, core.class.AttachedDoc, 'activity' as Domain),
    createClass(activity.class.Applet, core.class.Doc, DOMAIN_MODEL),
    createClass(activity.class.AppletInstance, core.class.AttachedDoc, 'applet' as Domain),
    createClass(activity.class.Poll, activity.class.AppletInstance),
    createClass(activity.class.PollAnswer, core.class.Doc, 'poll-answer' as Domain),
    createClass(activity.class.VotePollAction, core.class.Doc, 'transient' as Domain),

    // As models/activity/src/applets.ts declares it.
    factory.createTxCreateDoc<Doc>(
      activity.class.Applet,
      core.space.Model,
      {
        label: activity.string.Poll,
        pluralLabel: activity.string.Polls,
        icon: activity.icon.Poll,
        actionIcon: activity.icon.PollOutline,
        color: 'Orchid',
        component: activity.component.PollPresenter,
        createLabel: activity.string.CreatePoll,
        editLabel: activity.string.EditPoll,
        createComponent: activity.component.CreatePoll,
        previewComponent: activity.component.PollPreview,
        getTitleFn: activity.function.GetPollTitleFn,
        createFn: activity.function.CreatePollFn,
        editable: false,
        snapshotFields: [
          'mode',
          'anonymous',
          'quiz',
          'revote',
          'question',
          'options',
          'startAt',
          'endAt',
          'totalVotes',
          'votes'
        ],
        summaryFields: ['mode', 'anonymous', 'quiz', 'revote', 'question', 'startAt', 'endAt'],
        dependents: [activity.class.PollAnswer]
      } satisfies Data<Applet> as Data<Doc>,
      activity.applet.Poll
    )
  ]
}
