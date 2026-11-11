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

import { AccessLevel, type ReccuringInstance } from '@hcengineering/calendar'
import { type Class, type Client, type Doc, type DocumentQuery, type Ref } from '@hcengineering/core'
import type { AnyComponent } from '@hcengineering/ui'
import view, { type ObjectEditor } from '@hcengineering/view'

/** The card an event is opened with: the editor of the mixin that owns it, and the document to edit. */
export interface EventCard {
  editor: AnyComponent
  object: Doc
}

/**
 * The card a calendar event should be opened with, or `undefined` to leave the event to the
 * calendar's quick-edit popup.
 *
 * A meeting is opened as its own document: the popup edits the occurrence, while the title, rules
 * and participants live on the series. Two things stand in the way of a plain lookup, and both are
 * handled here. The calendar's query returns bare events and `Hierarchy.mixinOrClass` - what the
 * panel and `openDoc` use to pick a card - reads a mixin proxy, so the mixin is found explicitly
 * instead: on the object when the view queried the mixin itself, otherwise with one query per
 * candidate, since a mixin is a document carrying the id of the document it extends. And an
 * occurrence carries no mixin at all, only its master does, so the series is what gets opened.
 */
export async function eventCard (
  client: Client,
  event: Doc,
  calendarEditor: AnyComponent
): Promise<EventCard | undefined> {
  const hierarchy = client.getHierarchy()
  const candidates = hierarchy.getAllPossibleMixins(event._class).filter((mixin) => {
    const editor = hierarchy.classHierarchyMixin<Doc, ObjectEditor>(mixin, view.mixin.ObjectEditor)
    return editor?.editor !== undefined && editor.editor !== calendarEditor
  })
  if (candidates.length === 0) return undefined

  let mixin = candidates.find((it) => hierarchy.hasMixin(event, it))
  if (mixin === undefined) {
    const attached = await Promise.all(
      candidates.map((it) =>
        client.findOne(it as unknown as Ref<Class<Doc>>, { _id: event._id } as DocumentQuery<Doc>)
      )
    )
    mixin = candidates[attached.findIndex((it) => it !== undefined)]
    if (mixin === undefined) return undefined
  }
  const editor = hierarchy.classHierarchyMixin<Doc, ObjectEditor>(mixin, view.mixin.ObjectEditor)?.editor
  if (editor === undefined) return undefined

  // The identity of a series is its master, and an occurrence has no mixin to read it from.
  const seriesId = (event as ReccuringInstance).recurringEventId
  if (seriesId === undefined) return { editor, object: event }
  const master = await client.findOne(mixin as unknown as Ref<Class<Doc>>, {
    eventId: seriesId,
    access: AccessLevel.Owner
  } as DocumentQuery<Doc>)
  return { editor, object: master ?? event }
}
