//
// Copyright @ 2024 Hardcore Engineering Inc.
//

import questions, { type Answer, type Question } from '@intabiafusion/questions'
import { type Doc, SortingOrder } from '@intabiafusion/core'
import { getClient } from '@intabiafusion/presentation'

export async function findAnswers<Parent extends Doc, Collection extends Extract<keyof Parent, string> | string> (
  from: Parent,
  collection: Collection
): Promise<Array<Answer<Question<unknown>, unknown>>> {
  return await getClient().findAll(
    questions.class.Answer,
    {
      space: from.space,
      attachedToClass: from._class,
      attachedTo: from._id,
      collection
    },
    {
      sort: { rank: SortingOrder.Ascending }
    }
  )
}
