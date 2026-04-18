//
// Copyright @ 2024 Hardcore Engineering Inc.
//

import type { Answer, Question } from '@intabiafusion/questions'
import type { DocumentUpdate, TxOperations } from '@intabiafusion/core'

export async function updateAnswer<A extends Answer<Question<unknown>, unknown>> (
  client: TxOperations,
  answer: A,
  update: DocumentUpdate<A>
): Promise<void> {
  // TODO: Add check?
  await client.updateCollection(
    answer._class,
    answer.space,
    answer._id,
    answer.attachedTo,
    answer.attachedToClass,
    answer.collection,
    update
  )
}
