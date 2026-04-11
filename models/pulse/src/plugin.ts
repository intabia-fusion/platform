/**
  Copyright © 2026 Intabia Fusion.
  Licensed under the Eclipse Public License, Version 2.0 (the "License");
  you may not use this file except in compliance with the License.
  See https://www.eclipse.org/legal/epl-2.0
*/

import pulse, { pulseId } from '@hcengineering/pulse'
import { mergeIds } from '@hcengineering/platform'

export default mergeIds(pulseId, pulse, {})
