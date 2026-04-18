//
// Copyright @ 2024 Hardcore Engineering Inc.
//

import { copyQuestions } from '@intabiafusion/questions-resources'
import type { Training } from '@intabiafusion/training'
import { type Ref, type TxOperations } from '@intabiafusion/core'

export async function copyTrainingQuestions (ops: TxOperations, from: Training, to: Ref<Training>): Promise<void> {
  await copyQuestions(ops, from, 'questions', to)
}
