import { type Person } from '@intabiafusion/contact'
import { type Ref } from '@intabiafusion/core'
import { type IntlString } from '@intabiafusion/platform'

/**
 * @public
 */
export interface AssigneeCategory {
  label: IntlString
  func: (val: Array<Ref<Person>>) => Promise<Array<Ref<Person>>>
}
