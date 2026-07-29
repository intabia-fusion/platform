// Copyright © 2022 Hardcore Engineering Inc.
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

import { type Resources } from '@hcengineering/platform'
import tags, { type TagElement as TagElementType, type TagReference } from '@hcengineering/tags'
import { eventToHTMLElement, showPopup } from '@hcengineering/ui'
import TagsCategoryBar from './components/CategoryBar.svelte'
import CategoryPresenter from './components/CategoryPresenter.svelte'
import EditTagElement from './components/EditTagElement.svelte'
import TagElementPresenter from './components/TagElementPresenter.svelte'
import TagReferencePresenter from './components/TagReferencePresenter.svelte'
import Tags from './components/Tags.svelte'
import TagsDropdownEditor from './components/TagsDropdownEditor.svelte'
import TagsEditor from './components/TagsEditor.svelte'
import TagsItemPresenter from './components/TagsItemPresenter.svelte'
import TagsPresenter from './components/TagsPresenter.svelte'
import TagsView from './components/TagsView.svelte'
import TagElementCountPresenter from './components/TagElementCountPresenter.svelte'
import TagsFilter from './components/TagsFilter.svelte'
import TagsAttributeEditor from './components/TagsAttributeEditor.svelte'
import TagsEditorPopup from './components/TagsEditorPopup.svelte'
import LabelsPresenter from './components/LabelsPresenter.svelte'
import CreateTagElement from './components/CreateTagElement.svelte'
import ObjectsTagsEditorPopup from './components/ObjectsTagsEditorPopup.svelte'
import TagElement from './components/TagElement.svelte'
import { type Doc, type ObjQueryType, type Ref, type TxCUD } from '@hcengineering/core'
import { getClient } from '@hcengineering/presentation'
import { getRefs, selectedTagElements } from './utils'
import { type AttributeApplierResult, type Filter } from '@hcengineering/view'
import WeightPopup from './components/WeightPopup.svelte'
import DraftTagsEditor from './components/DraftTagsEditor.svelte'
import TagsFilterPresenter from './components/TagsFilterPresenter.svelte'
import DocTagsEditor from './components/DocTagsEditor.svelte'

export { WeightPopup, TagElement, selectedTagElements, TagElementPresenter }
export async function tagsInResult (filter: Filter, onUpdate: () => void): Promise<ObjQueryType<any>> {
  const result = await getRefs(filter, onUpdate)
  return { $in: result }
}

export async function tagsNinResult (filter: Filter, onUpdate: () => void): Promise<ObjQueryType<any>> {
  const result = await getRefs(filter, onUpdate)
  return { $nin: result }
}

export async function createTagElement (props: Record<string, any> = {}): Promise<void> {
  showPopup(CreateTagElement, props, 'top')
}

export default async (): Promise<Resources> => ({
  component: {
    Tags,
    TagReferencePresenter,
    TagElementPresenter,
    TagsPresenter,
    TagsView,
    TagsFilter,
    TagsEditor,
    TagsDropdownEditor,
    TagsItemPresenter,
    CategoryPresenter,
    TagsCategoryBar,
    TagElementCountPresenter,
    TagsAttributeEditor,
    TagsEditorPopup,
    LabelsPresenter,
    ObjectsTagsEditorPopup,
    TagsFilterPresenter,
    DraftTagsEditor,
    DocTagsEditor
  },
  actionImpl: {
    Open: (value: TagElementType, evt: MouseEvent) => {
      showPopup(EditTagElement, { value, keyTitle: '' }, eventToHTMLElement(evt))
    }
  },
  function: {
    FilterTagsInResult: tagsInResult,
    FilterTagsNinResult: tagsNinResult,
    CreateTagElement: createTagElement,
    LabelsApplier: labelsApplier
  }
})

export async function labelsApplier (
  doc: Doc,
  value: Array<Ref<TagElementType>> | undefined
): Promise<AttributeApplierResult<Doc>> {
  if (!Array.isArray(value)) return {}

  const client = getClient()
  const txes: Array<TxCUD<Doc>> = []

  const existing = (await client.findAll(tags.class.TagReference, { attachedTo: doc._id })) as TagReference[]
  const existingTagIds = existing.map((it) => it.tag)

  const toAdd = value.filter((tagId) => !existingTagIds.includes(tagId))
  const toRemove = existing.filter((it) => !value.includes(it.tag))

  if (toAdd.length > 0) {
    const tagElements = await client.findAll(tags.class.TagElement, { _id: { $in: toAdd } })
    const tagElementsMap = new Map(tagElements.map((el) => [el._id, el]))

    for (const tagId of toAdd) {
      const tagElement = tagElementsMap.get(tagId)
      const createTx = client.txFactory.createTxCreateDoc(tags.class.TagReference, doc.space, {
        attachedTo: doc._id,
        attachedToClass: doc._class,
        collection: 'labels',
        tag: tagId,
        title: tagElement?.title ?? '',
        color: tagElement?.color ?? 0
      })
      const tx = client.txFactory.createTxCollectionCUD(doc._class, doc._id, doc.space, 'labels', createTx)
      txes.push(tx)
    }
  }

  for (const it of toRemove) {
    const removeTx = client.txFactory.createTxRemoveDoc(tags.class.TagReference, it.space, it._id)
    const tx = client.txFactory.createTxCollectionCUD(doc._class, doc._id, doc.space, 'labels', removeTx)
    txes.push(tx)
  }

  return { txes }
}
