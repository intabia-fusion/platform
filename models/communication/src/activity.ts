import { type Builder, Mixin, Model } from '@hcengineering/model'
import communication, { type ActivityControl, type IgnoreActivity } from '@hcengineering/communication'
import core, { type Class, type Doc, type DocumentQuery, DOMAIN_MODEL, type Ref, type Tx } from '@hcengineering/core'
import { TClass, TDoc } from '@hcengineering/model-core'

@Model(communication.class.ActivityControl, core.class.Doc, DOMAIN_MODEL)
export class TActivityControl extends TDoc implements ActivityControl {
  objectClass!: Ref<Class<Doc>>

  // A set of rules to be skipped from generate doc update activity messages
  skip!: DocumentQuery<Tx>[]
}

@Mixin(communication.mixin.IgnoreActivity, core.class.Class)
export class TIgnoreActivity extends TClass implements IgnoreActivity {}

export function buildActivity (builder: Builder): void {
  builder.createModel(TActivityControl, TIgnoreActivity)
}
