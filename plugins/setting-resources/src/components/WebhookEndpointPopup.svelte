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
  import core, { concatLink, SortingOrder, type Ref, type Space } from '@hcengineering/core'
  import setting, {
    generateWebhookSecret,
    webhookEventSamples,
    type WebhookDelivery,
    type WebhookEndpoint,
    type WebhookSecretEntry
  } from '@hcengineering/setting'
  import { getMetadata } from '@hcengineering/platform'
  import presentation, { copyTextToClipboard, createQuery, getClient, MessageBox } from '@hcengineering/presentation'
  import {
    Button,
    ButtonIcon,
    CheckBox,
    Chip,
    eventToHTMLElement,
    IconAdd,
    Label,
    Modal,
    ModernToggle,
    showPopup
  } from '@hcengineering/ui'
  import { createEventDispatcher } from 'svelte'
  import settingsRes from '../plugin'
  import { webhookEventLabels, webhookEventTypes, type WebhookEventType } from '../webhookEvents'
  import ApiKeySpacesPopup from './ApiKeySpacesPopup.svelte'
  import { isApiKeyPickableSpace } from '../utils'

  export let endpoint: WebhookEndpoint | undefined = undefined

  // Which event's sample is shown in the right-hand panel - independent of the checkbox selection.
  let selectedExampleType: WebhookEventType = webhookEventTypes[0]

  const client = getClient()
  const dispatch = createEventDispatcher()
  const detailQuery = createQuery()
  const deliveryQuery = createQuery()

  let url = endpoint?.url ?? ''
  let events = new Set<string>(endpoint?.events ?? [])
  let spaces: Ref<Space>[] = endpoint?.spaces ?? []
  let saving = false
  let error: string | undefined

  let revealedSecretIds = new Set<string>()
  let deliveries: WebhookDelivery[] = []
  let testing = false
  let testResult: { delivered: boolean, status?: number, error?: string } | undefined

  $: if (endpoint !== undefined) {
    detailQuery.query(setting.class.WebhookEndpoint, { _id: endpoint._id }, (res) => {
      if (res[0] !== undefined) endpoint = res[0]
    })
    deliveryQuery.query(
      setting.class.WebhookDelivery,
      { endpoint: endpoint._id },
      (res) => {
        deliveries = res
      },
      { sort: { createdOn: SortingOrder.Descending }, limit: 20 }
    )
  } else {
    detailQuery.unsubscribe()
    deliveryQuery.unsubscribe()
  }

  // Same set ApiKeySpacesPopup offers, so "Add all" and the picker can never disagree.
  let pickableSpaces: Space[] = []
  let spaceNames = new Map<Ref<Space>, string>()
  const hierarchy = client.getHierarchy()
  const spacesQuery = createQuery()
  spacesQuery.query(core.class.Space, {}, (res) => {
    pickableSpaces = res.filter((s) => isApiKeyPickableSpace(hierarchy, s))
    spaceNames = new Map(pickableSpaces.map((s) => [s._id, s.name]))
  })

  function removeSpace (spaceId: Ref<Space>): void {
    spaces = spaces.filter((id) => id !== spaceId)
  }

  function pickSpaces (event: MouseEvent): void {
    showPopup(
      ApiKeySpacesPopup,
      { selectedObjects: spaces },
      eventToHTMLElement(event),
      undefined,
      (result: Ref<Space>[] | undefined) => {
        if (result != null) {
          spaces = result
        }
      }
    )
  }

  function addAllSpaces (): void {
    spaces = pickableSpaces.map((s) => s._id)
  }

  // A stand served over plain http has no TLS to protect anyway, and its pod runs with
  // ALLOW_INSECURE_WEBHOOK_HTTP - only there is an http recipient accepted.
  const allowHttp = location.protocol !== 'https:'
  $: urlValid = (allowHttp ? /^https?:\/\// : /^https:\/\//).test(url.trim())
  $: canSave = !saving && urlValid && events.size > 0

  function toggleEvent (type: WebhookEventType, checked: boolean): void {
    if (checked) events.add(type)
    else events.delete(type)
    events = events
  }

  async function save (): Promise<void> {
    if (!canSave) return
    saving = true
    error = undefined
    try {
      if (endpoint === undefined) {
        const newSecret: WebhookSecretEntry = {
          id: crypto.randomUUID(),
          secret: generateWebhookSecret(),
          createdOn: Date.now()
        }
        const _id = await client.createDoc(setting.class.WebhookEndpoint, core.space.Workspace, {
          url: url.trim(),
          events: Array.from(events),
          spaces,
          secrets: [newSecret],
          enabled: true,
          failureCount: 0
        })
        endpoint = await client.findOne(setting.class.WebhookEndpoint, { _id })
        revealedSecretIds.add(newSecret.id)
        revealedSecretIds = revealedSecretIds
      } else {
        await client.updateDoc(setting.class.WebhookEndpoint, core.space.Workspace, endpoint._id, {
          url: url.trim(),
          events: Array.from(events),
          spaces
        })
      }
    } catch (err: any) {
      error = `${err}`
    } finally {
      saving = false
    }
  }

  async function toggleEnabled (): Promise<void> {
    if (endpoint === undefined) return
    await client.updateDoc(setting.class.WebhookEndpoint, core.space.Workspace, endpoint._id, {
      enabled: !endpoint.enabled
    })
  }

  async function addSecret (): Promise<void> {
    if (endpoint === undefined || endpoint.secrets.length >= 2) return
    const newSecret: WebhookSecretEntry = {
      id: crypto.randomUUID(),
      secret: generateWebhookSecret(),
      createdOn: Date.now()
    }
    await client.updateDoc(setting.class.WebhookEndpoint, core.space.Workspace, endpoint._id, {
      secrets: [...endpoint.secrets, newSecret]
    })
    revealedSecretIds.add(newSecret.id)
    revealedSecretIds = revealedSecretIds
  }

  function revokeSecret (secretId: string): void {
    if (endpoint === undefined || endpoint.secrets.length <= 1) return
    const current = endpoint
    showPopup(MessageBox, {
      label: settingsRes.string.WebhookSecretRevoke,
      message: settingsRes.string.WebhookSecretRevokeConfirm,
      dangerous: true,
      okLabel: settingsRes.string.WebhookSecretRevoke,
      action: async () => {
        await client.updateDoc(setting.class.WebhookEndpoint, core.space.Workspace, current._id, {
          secrets: current.secrets.filter((s) => s.id !== secretId)
        })
      }
    })
  }

  function toggleReveal (secretId: string): void {
    if (revealedSecretIds.has(secretId)) revealedSecretIds.delete(secretId)
    else revealedSecretIds.add(secretId)
    revealedSecretIds = revealedSecretIds
  }

  function maskSecret (secret: string): string {
    return `${secret.slice(0, 10)}••••••••${secret.slice(-4)}`
  }

  async function copySecret (secret: string): Promise<void> {
    if (!window.isSecureContext) return
    await copyTextToClipboard(secret)
  }

  function formatDate (timestamp: number): string {
    return new Date(timestamp).toLocaleString()
  }

  function remove (): void {
    if (endpoint === undefined) return
    const current = endpoint
    showPopup(MessageBox, {
      label: settingsRes.string.WebhookDelete,
      message: settingsRes.string.WebhookDeleteConfirm,
      dangerous: true,
      okLabel: settingsRes.string.WebhookDelete,
      action: async () => {
        await client.removeDoc(setting.class.WebhookEndpoint, core.space.Workspace, current._id)
        dispatch('close')
      }
    })
  }

  async function sendTest (): Promise<void> {
    if (endpoint === undefined) return
    testing = true
    testResult = undefined
    try {
      const base = getMetadata(setting.metadata.WebhookServiceUrl) ?? ''
      const token = getMetadata(presentation.metadata.Token) ?? ''
      const workspace = getMetadata(presentation.metadata.WorkspaceUuid) ?? ''
      const res = await fetch(concatLink(base, `/${workspace}/test/${endpoint._id}`), {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      })
      testResult = await res.json()
    } catch (err: any) {
      testResult = { delivered: false, error: `${err}` }
    } finally {
      testing = false
    }
  }
</script>

<Modal
  label={endpoint === undefined ? settingsRes.string.AddWebhook : settingsRes.string.WebhookManage}
  type="type-popup"
  width="large"
  okLabel={endpoint === undefined ? settingsRes.string.WebhookCreate : settingsRes.string.WebhookSaveChanges}
  okAction={save}
  okLoading={saving}
  {canSave}
  showCancelButton={false}
  onCancel={() => {
    dispatch('close')
  }}
>
  <div class="flex-col-stretch flex-gap-4">
    <div class="flex-col flex-gap-2">
      <Label label={settingsRes.string.WebhookUrl} />
      <input
        class="urlInput"
        class:invalid={url.length > 0 && !urlValid}
        bind:value={url}
        placeholder="https://example.com/webhooks"
      />
      {#if url.length > 0 && !urlValid}
        <div class="hint warn"><Label label={settingsRes.string.WebhookUrlHttpsOnly} /></div>
      {/if}
    </div>

    <div class="flex-row-stretch flex-gap-4 eventsSection">
      <div class="flex-col flex-gap-2 eventsList">
        <Label label={settingsRes.string.WebhookEventsLabel} />
        <div class="hint"><Label label={settingsRes.string.WebhookEventsHint} /></div>
        {#each webhookEventTypes as type}
          <div class="eventRow" class:selected={selectedExampleType === type}>
            <CheckBox
              checked={events.has(type)}
              on:value={(e) => {
                toggleEvent(type, e.detail)
              }}
            />
            <button
              type="button"
              class="eventLabelBtn"
              on:click={() => {
                selectedExampleType = type
              }}
            >
              <Label label={webhookEventLabels[type]} />
            </button>
          </div>
        {/each}
      </div>
      <div class="examplePanel">
        <div class="sectionTitle"><Label label={settingsRes.string.WebhookExamplePayload} /></div>
        <pre class="samplePayload">{JSON.stringify(webhookEventSamples[selectedExampleType], null, 2)}</pre>
      </div>
    </div>

    <div class="flex-col flex-gap-2">
      <div class="flex-row-center flex-between">
        <Label label={settingsRes.string.WebhookSpaces} />
        <div class="flex-row-center flex-gap-1">
          <ButtonIcon
            kind="tertiary"
            size="small"
            icon={IconAdd}
            tooltip={{ label: presentation.string.Add }}
            on:click={pickSpaces}
          />
          <Button
            kind="ghost"
            size="small"
            label={settingsRes.string.ApiKeyAddAll}
            disabled={pickableSpaces.length === 0 || spaces.length === pickableSpaces.length}
            on:click={addAllSpaces}
          />
        </div>
      </div>
      <div class="hint"><Label label={settingsRes.string.WebhookSpacesHint} /></div>
      {#if spaces.length > 0}
        <div class="chips">
          {#each spaces as spaceId (spaceId)}
            <Chip
              label={spaceNames.get(spaceId) ?? spaceId}
              isRemovable
              on:remove={() => {
                removeSpace(spaceId)
              }}
            />
          {/each}
        </div>
      {/if}
    </div>

    {#if endpoint !== undefined}
      <div class="flex-row-center flex-between">
        <Label label={endpoint.enabled ? settingsRes.string.WebhookEnabled : settingsRes.string.WebhookDisabled} />
        <ModernToggle size="small" checked={endpoint.enabled} on:change={toggleEnabled} />
      </div>

      <div class="flex-col flex-gap-2">
        <div class="flex-row-center flex-between">
          <div class="sectionTitle"><Label label={settingsRes.string.WebhookSecrets} /></div>
          <Button
            label={settingsRes.string.WebhookSecretAdd}
            kind="regular"
            size="small"
            icon={IconAdd}
            disabled={endpoint.secrets.length >= 2}
            on:click={addSecret}
          />
        </div>
        <div class="hint"><Label label={settingsRes.string.WebhookSecretShownHint} /></div>
        <div class="hint"><Label label={settingsRes.string.WebhookSecretAddHint} /></div>
        {#if endpoint.secrets.length >= 2}
          <div class="hint"><Label label={settingsRes.string.WebhookSecretMaxTwo} /></div>
        {:else if endpoint.secrets.length <= 1}
          <div class="hint"><Label label={settingsRes.string.WebhookSecretMinOne} /></div>
        {/if}
        {#each endpoint.secrets as secret (secret.id)}
          <div class="secretRow">
            <div class="flex-col flex-gap-1">
              <!-- svelte-ignore a11y-click-events-have-key-events -->
              <!-- svelte-ignore a11y-no-static-element-interactions -->
              <div
                class="secretValue"
                on:click={() => {
                  void copySecret(secret.secret)
                }}
              >
                {revealedSecretIds.has(secret.id) ? secret.secret : maskSecret(secret.secret)}
              </div>
              <div class="hint">
                <Label label={settingsRes.string.WebhookSecretCreatedOn} />: {formatDate(secret.createdOn)}
              </div>
            </div>
            <div class="flex-row-center flex-gap-2">
              <Button
                label={revealedSecretIds.has(secret.id)
                  ? settingsRes.string.WebhookSecretHide
                  : settingsRes.string.WebhookSecretReveal}
                kind="ghost"
                size="small"
                on:click={() => {
                  toggleReveal(secret.id)
                }}
              />
              <Button
                label={settingsRes.string.WebhookSecretRevoke}
                kind="dangerous"
                size="small"
                disabled={endpoint.secrets.length <= 1}
                on:click={() => {
                  revokeSecret(secret.id)
                }}
              />
            </div>
          </div>
        {/each}
      </div>

      <div class="flex-col flex-gap-2">
        <div class="flex-row-center flex-between">
          <div class="sectionTitle"><Label label={settingsRes.string.WebhookDeliveries} /></div>
          <Button
            label={settingsRes.string.WebhookSendTest}
            kind="regular"
            size="small"
            loading={testing}
            on:click={sendTest}
          />
        </div>
        {#if testResult !== undefined}
          <div class="hint" class:warn={!testResult.delivered}>
            {#if testResult.delivered}
              <Label label={settingsRes.string.WebhookTestSuccess} params={{ status: testResult.status }} />
            {:else if testResult.status !== undefined}
              <Label label={settingsRes.string.WebhookTestFailure} params={{ error: `HTTP ${testResult.status}` }} />
            {:else}
              <Label label={settingsRes.string.WebhookTestFailure} params={{ error: testResult.error ?? '' }} />
            {/if}
          </div>
        {/if}
        {#if deliveries.length === 0}
          <div class="hint"><Label label={settingsRes.string.WebhookDeliveriesEmpty} /></div>
        {:else}
          {#each deliveries as delivery (delivery._id)}
            <div class="deliveryRow">
              <span>{formatDate(delivery.createdOn ?? 0)}</span>
              {#if delivery.status !== undefined}
                <span
                  ><Label
                    label={settingsRes.string.WebhookDeliverySuccess}
                    params={{ status: delivery.status }}
                  /></span
                >
              {:else}
                <span class="warn"
                  ><Label
                    label={settingsRes.string.WebhookDeliveryFailed}
                    params={{ error: delivery.error ?? '' }}
                  /></span
                >
              {/if}
            </div>
          {/each}
        {/if}
      </div>

      <Button label={settingsRes.string.WebhookDelete} kind="dangerous" size="small" on:click={remove} />
    {/if}

    {#if error}
      <div class="hint warn">{error}</div>
    {/if}
  </div>
</Modal>

<style lang="scss">
  .hint {
    color: var(--theme-dark-color);
    font-size: 0.8125rem;
  }
  .warn {
    color: var(--theme-error-color);
  }
  .sectionTitle {
    font-weight: 500;
  }
  .chips {
    display: flex;
    flex-wrap: wrap;
    gap: 0.375rem;
  }
  .urlInput {
    width: 100%;
    padding: 0.375rem 0.75rem;
    border: 1px solid var(--theme-divider-color);
    border-radius: 0.375rem;
    background: var(--theme-bg-color);
    color: var(--theme-content-color);
    font-family: monospace;

    &.invalid {
      border-color: var(--theme-error-color);
    }
  }
  .secretRow {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
    padding: 0.5rem;
    border: 1px solid var(--theme-divider-color);
    border-radius: 0.375rem;
  }
  .secretValue {
    font-family: monospace;
    font-size: 0.8125rem;
    cursor: pointer;
    word-break: break-all;
  }
  .deliveryRow {
    display: flex;
    justify-content: space-between;
    gap: 0.75rem;
    font-size: 0.8125rem;
    padding: 0.25rem 0;
    border-bottom: 1px solid var(--theme-divider-color);
  }
  .eventsSection {
    min-width: 0;
    align-items: stretch;
  }
  .eventsList {
    flex: 1 1 50%;
    min-width: 0;
  }
  .eventRow {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.25rem 0.5rem;
    border-radius: 0.375rem;

    &.selected {
      background: var(--theme-button-default);
    }
  }
  .eventLabelBtn {
    background: none;
    border: none;
    padding: 0;
    margin: 0;
    font: inherit;
    color: inherit;
    text-align: left;
    cursor: pointer;

    &:hover {
      text-decoration: underline;
    }
  }
  .examplePanel {
    flex: 1 1 50%;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 0.375rem;
    padding: 0.75rem;
    border: 1px solid var(--theme-divider-color);
    border-radius: 0.5rem;
  }
  .samplePayload {
    max-width: 100%;
    max-height: 22rem;
    overflow: auto;
    margin: 0;
    padding: 0.5rem;
    font-family: monospace;
    font-size: 0.75rem;
    background: var(--theme-bg-color);
    border: 1px solid var(--theme-divider-color);
    border-radius: 0.375rem;
  }
</style>
