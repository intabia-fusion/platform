//
// Copyright © 2023 Hardcore Engineering Inc.
//

import { type Ref } from '@intabiafusion/core'
import { getCurrentEmployee, type Employee } from '@intabiafusion/contact'

export function getCurrentEmployeeRef (): Ref<Employee> {
  return getCurrentEmployee()
}
