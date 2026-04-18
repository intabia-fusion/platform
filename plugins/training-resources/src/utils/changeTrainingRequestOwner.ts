//
// Copyright @ 2024 Hardcore Engineering Inc.
//

import type { TrainingRequest } from '@intabiafusion/training'
import type { Employee } from '@intabiafusion/contact'
import type { Ref } from '@intabiafusion/core'
import { getClient } from '@intabiafusion/presentation'
import { canChangeTrainingRequestOwner } from './canChangeTrainingRequestOwner'

export async function changeTrainingRequestOwner (request: TrainingRequest, owner: Ref<Employee>): Promise<void> {
  if (canChangeTrainingRequestOwner(request)) {
    await getClient().update(request, { owner })
  }
}
