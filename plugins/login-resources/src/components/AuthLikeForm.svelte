<script lang="ts">
  import { IntlString, OK, PlatformError, Status, unknownError } from '@hcengineering/platform'

  import type { Field } from '../types'
  import Form from './Form.svelte'
  import login from '../plugin'
  import ConsentCheckboxes from './ConsentCheckboxes.svelte'

  export let proceedButton: IntlString = login.string.Proceed
  export let handleProceed: (firstName: string | undefined, lastName: string | undefined) => void | Promise<void>
  export let firstName: string | undefined = undefined
  export let lastName: string | undefined = undefined
  export let caption: IntlString | undefined = undefined
  export let signUpDisabled: boolean = false
  export let proceedDisabled: boolean = true

  let status: Status = OK
  let agreedPersonalData: boolean
  let agreedRules: boolean

  let fields: Field[]
  $: fields = [
    { id: 'first_name', name: 'firstName', i18n: login.string.FirstName },
    { id: 'last_name', name: 'lastName', i18n: login.string.LastName, optional: true }
  ]
  $: formData = {
    firstName,
    lastName
  } satisfies { firstName: string | undefined, lastName: string | undefined }

  const action = {
    i18n: proceedButton,
    func: async () => {
      try {
        await handleProceed(formData.firstName, formData.lastName)
      } catch (err: any) {
        if (err instanceof PlatformError) {
          status = err.status
        } else {
          status = unknownError(err)
        }
      }
    }
  }

  $: proceedDisabled = !agreedPersonalData || !agreedRules
</script>

<slot name="before-form" />
<Form {caption} {status} {proceedDisabled} {fields} object={formData} {action} ignoreInitialValidation {signUpDisabled}>
  <div slot="after-fields" class="form-row">
    <ConsentCheckboxes bind:agreedPersonalData bind:agreedRules />
  </div>
</Form>
<slot name="after-form" />
