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
  import { type ApiKeyInfo, type CreatedApiKey } from '@hcengineering/account-client'
  import core, { AccountRole, type Ref, type Space, getCurrentAccount, hasAccountRole } from '@hcengineering/core'
  import type { IntlString } from '@hcengineering/platform'
  import { MessageBox, createQuery, getClient } from '@hcengineering/presentation'
  import setting, { type WebhookEndpoint, type WebhookStat } from '@hcengineering/setting'
  import {
    Breadcrumb,
    Button,
    Header,
    IconAdd,
    Label,
    Loading,
    ModernToggle,
    Scroller,
    showPopup
  } from '@hcengineering/ui'
  import { onMount } from 'svelte'
  import settingsRes from '../plugin'
  import { webhookEventLabels } from '../webhookEvents'
  import { getAccountClient } from '../utils'
  import ApiKeyPopup from './ApiKeyPopup.svelte'
  import ApiKeyTable from './ApiKeyTable.svelte'
  import ConstructIncomingWebhookPopup from './ConstructIncomingWebhookPopup.svelte'
  import CreateApiKeyPopup from './CreateApiKeyPopup.svelte'
  import WebhookEndpointPopup from './WebhookEndpointPopup.svelte'

  // Same role check as before this page merged the two categories - a non-Owner must see the Incoming
  // section only, never any Outgoing recipient, URL or control.
  const isOwner = hasAccountRole(getCurrentAccount(), AccountRole.Owner)
  const myAccount = getCurrentAccount().uuid
  const client = getClient()

  // ---- Incoming (API keys) ----

  let loading = true
  let keys: ApiKeyInfo[] = []
  let limit = 0
  let personalLimit = 0

  // Mirrors isApiKeyUsable in server/account/src/apiKeys.ts
  function isUsable (key: ApiKeyInfo): boolean {
    return key.revokedOn === undefined && (key.expiresOn === undefined || key.expiresOn > Date.now())
  }

  // Owner's listApiKeys() returns every key in the workspace - keep only the caller's own personal keys here.
  $: personalKeys = keys.filter((k) => k.personal === true && k.createdBy === myAccount)
  $: integrationKeys = keys.filter((k) => k.personal !== true)
  $: personalUsed = personalKeys.filter(isUsable).length
  $: integrationUsed = integrationKeys.filter(isUsable).length

  function loadKeys (): void {
    loading = true
    getAccountClient()
      .listApiKeys()
      .then((res) => {
        keys = res.keys
        limit = res.limit
        personalLimit = res.personalLimit
        loading = false
      })
      .catch((err: any) => {
        console.error('Failed to load API keys', err)
        loading = false
      })
  }

  // Resolves the names of every space referenced by any key, for each row's expanded detail.
  let spaceNames = new Map<Ref<Space>, string>()
  const spacesQuery = createQuery()
  $: {
    const ids = Array.from(new Set(keys.flatMap((k) => k.spaces)))
    if (ids.length > 0) {
      spacesQuery.query(core.class.Space, { _id: { $in: ids } }, (res) => {
        spaceNames = new Map(res.map((s) => [s._id, s.name]))
      })
    } else {
      spacesQuery.unsubscribe()
      spaceNames = new Map()
    }
  }

  // Received-message counts per key, one workspace query for the whole page (not one per row).
  // Map<keyId, Map<operation, count>>
  function groupStats (stats: WebhookStat[]): Map<string, Map<string, number>> {
    const result = new Map<string, Map<string, number>>()
    for (const s of stats) {
      let byType = result.get(s.target)
      if (byType === undefined) {
        byType = new Map()
        result.set(s.target, byType)
      }
      byType.set(s.type, s.count)
    }
    return result
  }

  let inStats: WebhookStat[] = []
  const inStatsQuery = createQuery()
  inStatsQuery.query(setting.class.WebhookStat, { direction: 'in' }, (res) => {
    inStats = res
  })
  $: inStatsByKey = groupStats(inStats)

  function openCreate (personal: boolean): void {
    showPopup(CreateApiKeyPopup, { personal }, 'top', (result?: CreatedApiKey) => {
      if (result != null) {
        showPopup(ApiKeyPopup, { apiKey: result.key })
        loadKeys()
      }
    })
  }

  function revokeKey (key: ApiKeyInfo): void {
    showPopup(MessageBox, {
      labelStr: key.name,
      message: settingsRes.string.RevokeApiKeyConfirm,
      dangerous: true,
      okLabel: settingsRes.string.RevokeApiKey,
      action: async () => {
        await getAccountClient().revokeApiKey(key.keyId)
        loadKeys()
      }
    })
  }

  function openConstruct (): void {
    showPopup(ConstructIncomingWebhookPopup, {}, 'top')
  }

  onMount(loadKeys)

  // ---- Outgoing (webhooks), Owner only ----

  let endpoints: WebhookEndpoint[] = []
  let endpointsLoading = true
  let outStats: WebhookStat[] = []
  if (isOwner) {
    const endpointsQuery = createQuery()
    endpointsQuery.query(setting.class.WebhookEndpoint, {}, (res) => {
      endpoints = res
      endpointsLoading = false
    })

    const outStatsQuery = createQuery()
    outStatsQuery.query(setting.class.WebhookStat, { direction: 'out' }, (res) => {
      outStats = res
    })
  }
  // Sent-message counts per endpoint. Map<Ref<WebhookEndpoint>, Map<eventType, count>>
  $: outStatsByEndpoint = groupStats(outStats)

  function formatDate (timestamp: number): string {
    return new Date(timestamp).toLocaleString()
  }

  // endpoint.events is a plain string[] (the doc doesn't restrict it to the known set at rest) -
  // this widens the label lookup to a safe partial map instead of an unsafe index cast.
  const eventLabels: Partial<Record<string, IntlString>> = webhookEventLabels

  function eventLabel (eventType: string): IntlString | undefined {
    return eventLabels[eventType]
  }

  function openCreateWebhook (): void {
    showPopup(WebhookEndpointPopup, {}, 'top')
  }

  function openEditWebhook (endpoint: WebhookEndpoint): void {
    showPopup(WebhookEndpointPopup, { endpoint }, 'top')
  }

  async function toggleEnabled (endpoint: WebhookEndpoint): Promise<void> {
    const enabled = !endpoint.enabled
    // Re-enabling clears failureCount - the delivery pod (delivery.ts) only resets it on a successful
    // delivery, so without this a manual re-enable after an auto-disable would start back at the old count.
    await client.updateDoc(setting.class.WebhookEndpoint, core.space.Workspace, endpoint._id, {
      enabled,
      ...(enabled ? { failureCount: 0 } : {})
    })
  }
</script>

<div class="hulyComponent">
  <Header adaptive={'disabled'}>
    <Breadcrumb icon={settingsRes.icon.Setting} label={settingsRes.string.Integrations} size={'large'} isCurrent />
  </Header>
  <div class="hulyComponent-content__column content">
    <Scroller align={'center'} padding={'var(--spacing-3)'} bottomPadding={'var(--spacing-3)'}>
      <div class="hulyComponent-content flex-col flex-gap-6">
        <!-- Incoming -->
        <div class="flex-col flex-gap-4">
          <div class="flex-row-center flex-between">
            <div class="title"><Label label={settingsRes.string.WebhookIncomingAccess} /></div>
            <Button label={settingsRes.string.WebhookConstruct} kind="regular" size="small" on:click={openConstruct} />
          </div>

          <div class="flex-col flex-gap-4">
            <div class="flex-row-center flex-between">
              <div class="subtitle"><Label label={settingsRes.string.PersonalApiKeys} /></div>
              <Button
                label={settingsRes.string.CreatePersonalApiKey}
                kind="regular"
                size="small"
                icon={IconAdd}
                disabled={!loading && personalUsed >= personalLimit}
                showTooltip={!loading && personalUsed >= personalLimit
                  ? { label: settingsRes.string.ApiKeyLimitReachedError, props: { limit: personalLimit } }
                  : undefined}
                on:click={() => {
                  openCreate(true)
                }}
              />
            </div>
            {#if !loading}
              <div class="usage">
                <Label label={settingsRes.string.ApiKeysUsage} params={{ used: personalUsed, limit: personalLimit }} />
              </div>
            {/if}

            {#if loading}
              <Loading />
            {:else if personalKeys.length === 0}
              <Label label={settingsRes.string.NoApiKeys} />
            {:else}
              <ApiKeyTable keys={personalKeys} {spaceNames} onRevoke={revokeKey} statsByKey={inStatsByKey} />
            {/if}
          </div>

          {#if isOwner}
            <div class="flex-col flex-gap-4">
              <div class="flex-row-center flex-between">
                <div class="subtitle"><Label label={settingsRes.string.IntegrationApiKeys} /></div>
                <Button
                  label={settingsRes.string.CreateIntegrationApiKey}
                  kind="regular"
                  size="small"
                  icon={IconAdd}
                  disabled={!loading && integrationUsed >= limit}
                  showTooltip={!loading && integrationUsed >= limit
                    ? { label: settingsRes.string.ApiKeyLimitReachedError, props: { limit } }
                    : undefined}
                  on:click={() => {
                    openCreate(false)
                  }}
                />
              </div>
              {#if !loading}
                <div class="usage">
                  <Label label={settingsRes.string.ApiKeysUsage} params={{ used: integrationUsed, limit }} />
                </div>
              {/if}

              {#if loading}
                <Loading />
              {:else if integrationKeys.length === 0}
                <Label label={settingsRes.string.NoApiKeys} />
              {:else}
                <ApiKeyTable keys={integrationKeys} {spaceNames} onRevoke={revokeKey} statsByKey={inStatsByKey} />
              {/if}
            </div>
          {/if}
        </div>

        {#if isOwner}
          <div class="sectionDivider" />

          <!-- Outgoing -->
          <div class="flex-col flex-gap-4">
            <div class="flex-row-center flex-between">
              <div class="title"><Label label={settingsRes.string.WebhookAccess} /></div>
              <Button
                label={settingsRes.string.AddWebhook}
                kind="regular"
                size="small"
                icon={IconAdd}
                on:click={openCreateWebhook}
              />
            </div>

            {#if endpointsLoading}
              <Loading />
            {:else if endpoints.length === 0}
              <Label label={settingsRes.string.NoWebhooks} />
            {:else}
              <div class="flex-col flex-gap-3">
                {#each endpoints as endpoint (endpoint._id)}
                  <div
                    class="endpointRow"
                    class:disabled={!endpoint.enabled}
                    role="button"
                    tabindex="0"
                    on:click={() => {
                      openEditWebhook(endpoint)
                    }}
                    on:keydown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') openEditWebhook(endpoint)
                    }}
                  >
                    <div class="flex-row-center flex-between">
                      <div class="url">{endpoint.url}</div>
                      <!-- svelte-ignore a11y-click-events-have-key-events -->
                      <!-- svelte-ignore a11y-no-static-element-interactions -->
                      <div class="flex-row-center flex-gap-2" on:click|stopPropagation on:keydown|stopPropagation>
                        <ModernToggle
                          size="small"
                          checked={endpoint.enabled}
                          on:change={() => {
                            void toggleEnabled(endpoint)
                          }}
                        />
                      </div>
                    </div>
                    <div class="events">
                      {#each endpoint.events as eventType}
                        {@const label = eventLabel(eventType)}
                        {@const count = outStatsByEndpoint.get(endpoint._id)?.get(eventType) ?? 0}
                        <span class="badge">
                          {#if label !== undefined}
                            <Label {label} />
                          {:else}
                            {eventType}
                          {/if}
                          {#if count > 0}
                            &middot; <Label label={settingsRes.string.WebhookEventDeliveredCount} params={{ count }} />
                          {/if}
                        </span>
                      {/each}
                    </div>
                    <div class="meta">
                      <span>
                        <Label
                          label={endpoint.enabled
                            ? settingsRes.string.WebhookEnabled
                            : settingsRes.string.WebhookDisabled}
                        />
                      </span>
                      {#if endpoint.failureCount > 0}
                        <span class="warn"
                          ><Label
                            label={settingsRes.string.WebhookFailureCount}
                            params={{ count: endpoint.failureCount }}
                          /></span
                        >
                      {/if}
                      <span>
                        <Label label={settingsRes.string.WebhookLastDelivery} />:
                        {#if endpoint.lastDeliveryOn !== undefined}
                          {formatDate(endpoint.lastDeliveryOn)}
                        {:else}
                          <Label label={settingsRes.string.WebhookNeverDelivered} />
                        {/if}
                      </span>
                      {#if endpoint.lastError !== undefined}
                        <span class="warn"
                          ><Label label={settingsRes.string.WebhookLastError} />: {endpoint.lastError}</span
                        >
                      {/if}
                    </div>
                  </div>
                {/each}
              </div>
            {/if}
          </div>
        {/if}
      </div>
    </Scroller>
  </div>
</div>

<style lang="scss">
  .title {
    font-weight: 500;
    font-size: 1rem;
  }
  .subtitle {
    font-weight: 500;
  }
  .usage {
    font-size: 0.8125rem;
    color: var(--theme-dark-color);
  }
  .sectionDivider {
    height: 1px;
    background: var(--theme-divider-color);
    margin: 1.5rem 0 0.5rem;
  }
  .endpointRow {
    padding: 0.75rem;
    border: 1px solid var(--theme-divider-color);
    border-radius: 0.5rem;
    cursor: pointer;

    &.disabled {
      opacity: 0.5;
    }
  }
  .url {
    font-family: monospace;
    font-weight: 500;
    word-break: break-all;
  }
  .events {
    display: flex;
    flex-wrap: wrap;
    gap: 0.375rem;
    margin-top: 0.5rem;
  }
  .badge {
    font-size: 0.75rem;
    padding: 0.125rem 0.5rem;
    border-radius: 0.5rem;
    background: var(--theme-button-default);
    color: var(--theme-dark-color);
  }
  .meta {
    display: flex;
    flex-wrap: wrap;
    gap: 0.75rem;
    margin-top: 0.5rem;
    font-size: 0.8125rem;
    color: var(--theme-dark-color);
  }
  .warn {
    color: var(--theme-error-color);
  }
</style>
