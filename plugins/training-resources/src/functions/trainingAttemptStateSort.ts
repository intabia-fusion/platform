//
// Copyright @ 2024 Hardcore Engineering Inc.
//

import { type TrainingAttemptState, trainingAttemptStateOrder } from '@intabiafusion/training'
import { type TxOperations } from '@intabiafusion/core'

export async function trainingAttemptStateSort (
  _: TxOperations,
  states: TrainingAttemptState[]
): Promise<TrainingAttemptState[]> {
  return states
    .slice()
    .sort((state1, state2) => trainingAttemptStateOrder.indexOf(state2) - trainingAttemptStateOrder.indexOf(state1))
}
