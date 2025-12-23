import core from '@hcengineering/model-core'
import { type Builder, TypeNumber } from '@hcengineering/model'
import { type Class, type Doc, type Ref } from '@hcengineering/core'
import { createAttributePresenter } from '@hcengineering/model-view'

import communication from './plugin'

export function markClassMessageable (builder: Builder, _class: Ref<Class<Doc>>): void {
  builder.mixin(_class, core.class.Class, communication.mixin.Messageable, {})

  builder.createDoc(core.class.Attribute, core.space.Model, {
    name: 'comments',
    readonly: true,
    attributeOf: _class,
    type: TypeNumber(0),
    label: communication.string.Comments
  })

  builder.createDoc(core.class.Attribute, core.space.Model, {
    name: 'activity',
    readonly: true,
    hidden: true,
    attributeOf: _class,
    type: TypeNumber(0),
    label: communication.string.Comments
  })

  createAttributePresenter(
    builder,
    communication.component.CommentsNumberPresenter,
    _class,
    'comments' as any,
    'attribute'
  )
}
