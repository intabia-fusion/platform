//
// Copyright @ 2024 Hardcore Engineering Inc.
//

import type { Training } from '@intabiafusion/training'
import type { Location } from '@intabiafusion/ui'
import { trainingRoute } from '../routing/routes/trainingRoute'

export async function trainingLinkProviderEncode (object: Training, _props: Record<string, any>): Promise<Location> {
  return trainingRoute.build({ id: object._id, tab: null })
}
