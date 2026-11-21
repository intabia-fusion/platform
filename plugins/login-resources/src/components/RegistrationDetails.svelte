<!--
// Copyright © 2026 Intabia Fusion.
//
// Licensed under the Eclipse Public License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License. You may
// obtain a copy of the License at https://www.eclipse.org/legal/epl-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
//
// See the License for the specific language governing permissions and
// limitations under the License.
-->
<script lang="ts">
  import { MAX_PERSON_NAME_LENGTH } from '@hcengineering/account-client'
  import { OK, type Status } from '@hcengineering/platform'
  import { createEventDispatcher } from 'svelte'
  import login from '../plugin'
  import Form from './Form.svelte'
  import Label from './internal/Label.svelte'

  export let invited = false
  export let status: Status = OK
  export let initialStep: 'name' | 'workspace' = invited ? 'name' : 'workspace'
  export let initialFirstName = ''
  export let initialLastName = ''
  export let initialWorkspace = ''
  export let invitationWorkspace: string | undefined = undefined
  export let invitationInviter: string | undefined = undefined
  export let differentAccount: (() => void) | undefined = undefined
  export let saveName: ((firstName: string, lastName: string) => Promise<boolean>) | undefined = undefined
  export let saveWorkspace: ((workspace: string) => Promise<boolean>) | undefined = undefined

  const dispatch = createEventDispatcher<{
    complete: { firstName: string, lastName: string, workspace: string }
  }>()

  const details = {
    firstName: initialFirstName,
    lastName: initialLastName,
    workspace: initialWorkspace
  }
  const nameFields = [
    { id: 'given-name', name: 'firstName', i18n: login.string.FirstName, maxLength: MAX_PERSON_NAME_LENGTH },
    { id: 'family-name', name: 'lastName', i18n: login.string.LastName, maxLength: MAX_PERSON_NAME_LENGTH }
  ].filter((field) => !invited || details[field.name as 'firstName' | 'lastName'].trim() === '')
  const workspaceFields = [{ id: 'workspace', name: 'workspace', i18n: login.string.OnboardingWorkspaceName }]
  let step = initialStep

  const nameAction = {
    i18n: invited ? login.string.JoinWorkspaceAction : login.string.Continue,
    func: async () => {
      if (!invited && (saveName === undefined || !(await saveName(details.firstName, details.lastName)))) return
      dispatch('complete', { ...details })
    }
  }
  const workspaceAction = {
    i18n: login.string.Continue,
    func: async () => {
      if (saveWorkspace !== undefined && (await saveWorkspace(details.workspace))) step = 'name'
    }
  }
</script>

{#if step === 'name'}
  <Form
    caption={invited ? login.string.JoinWorkspaceAction : login.string.WhatIsYourName}
    hint={nameFields.length > 0 ? login.string.NameVisibilityHint : undefined}
    {status}
    fields={nameFields}
    object={details}
    action={nameAction}
    bottomActions={differentAccount !== undefined
      ? [{ i18n: login.string.UseDifferentAccount, func: differentAccount }]
      : []}
  >
    <svelte:fragment slot="context">
      {#if invitationWorkspace}
        <div class="invitation-context">
          {#if invitationInviter}
            <Label
              label={login.string.InvitationFrom}
              params={{ name: invitationInviter, workspace: invitationWorkspace }}
            />
          {:else}
            <Label label={login.string.InvitationTo} params={{ workspace: invitationWorkspace }} />
          {/if}
        </div>
      {/if}
    </svelte:fragment>
  </Form>
{:else}
  <Form
    caption={login.string.OnboardingCreateWorkspace}
    hint={login.string.WorkspacePurposeHint}
    {status}
    fields={workspaceFields}
    object={details}
    action={workspaceAction}
  >
    <slot slot="region-selector" name="region-selector" />
  </Form>
{/if}

<style lang="scss">
  .invitation-context {
    margin-bottom: 1.25rem;
    color: var(--login-label-color, var(--login-content-color, var(--theme-content-color)));
    font-size: 0.875rem;
    line-height: 1.3125rem;
    overflow-wrap: anywhere;
  }
</style>
