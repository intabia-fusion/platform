//
// Copyright @ 2024 Hardcore Engineering Inc.
//

import { checkMyPermission, permissionsStore } from '@intabiafusion/contact-resources'
import type { Training } from '@intabiafusion/training'
import { get } from 'svelte/store'
import { getCurrentEmployeeRef } from './getCurrentEmployeeRef'
import training from '../plugin'

export function canChangeTrainingOwner (trainingObject: Training): boolean {
  return (
    trainingObject.owner === getCurrentEmployeeRef() &&
    checkMyPermission(training.permission.ChangeSomeoneElsesTrainingOwner, trainingObject.space, get(permissionsStore))
  )
}
