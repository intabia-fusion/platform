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
  import { apiKeyOperations, type ApiKeyInfo, type ApiKeyOperation } from '@hcengineering/account-client'
  import { getCurrentEmployeeSpace } from '@hcengineering/contact'
  import { concatLink, type Doc, type Rank } from '@hcengineering/core'
  import { getMetadata } from '@hcengineering/platform'
  import presentation, { copyTextToClipboard, getClient } from '@hcengineering/presentation'
  import { makeRank } from '@hcengineering/rank'
  import setting, { type WebhookRuleTarget } from '@hcengineering/setting'
  import {
    Button,
    DropdownLabels,
    IconCopy,
    Label,
    Modal,
    eventToHTMLElement,
    showPopup,
    type DropdownTextItem
  } from '@hcengineering/ui'
  import view from '@hcengineering/view'
  import { createEventDispatcher } from 'svelte'
  import settingsRes from '../plugin'
  import { type WebhookRuleTemplate } from '../webhookRuleTemplates'
  import { targetKind } from '../webhookTargetKind'
  import WebhookTargetPicker from './WebhookTargetPicker.svelte'

  export let apiKey: ApiKeyInfo
  export let template: WebhookRuleTemplate
  // Only used for the ranks of the rules this popup creates - the section's own list re-sorts them.
  export let lastRank: string | undefined

  interface TargetLike extends Doc {
    identifier?: string
    name?: string
    title?: string
  }

  const client = getClient()
  const dispatch = createEventDispatcher()

  const grantedOps = apiKey.unrestricted === true ? [...apiKeyOperations] : apiKey.ops
  // Ops the template actually has fields for, intersected with what the key is granted.
  const templateOps = Array.from(new Set(template.rules.flatMap((r) => Object.keys(r.fields) as ApiKeyOperation[])))
  const availableOps = templateOps.filter((o) => grantedOps.includes(o))
  const opItems: DropdownTextItem[] = availableOps.map((o) => ({ id: o, label: o }))

  let action: ApiKeyOperation | undefined = availableOps.includes('chat:post') ? 'chat:post' : availableOps[0]
  let target: WebhookRuleTarget | undefined
  let saving = false
  let created = false
  let error: string | undefined

  function onActionChange (next: ApiKeyOperation | undefined): void {
    if (next === undefined) {
      target = undefined
      return
    }
    if (target !== undefined && target.kind !== targetKind(next).kind) {
      target = undefined
    }
  }
  $: onActionChange(action)

  function pickTarget (event: MouseEvent): void {
    if (action === undefined) return
    const kind = targetKind(action)
    showPopup(
      WebhookTargetPicker,
      {
        _class: kind._class,
        docQuery: kind.docQuery,
        searchField: kind.searchField,
        searchMode: kind.category !== undefined ? 'spotlight' : 'field',
        category: kind.category
      },
      eventToHTMLElement(event),
      (result?: Doc) => {
        if (result === undefined) return
        const doc = result as TargetLike
        target = {
          kind: kind.kind,
          id: kind.field === 'identifier' ? (doc.identifier ?? '') : doc._id,
          label: doc.name ?? doc.title ?? doc.identifier ?? ''
        }
      }
    )
  }

  $: canCreate = !saving && action !== undefined && target !== undefined

  async function create (): Promise<void> {
    if (action === undefined || target === undefined) return
    const act = action
    const tgt = target
    saving = true
    error = undefined
    try {
      let prevRank: Rank | undefined = lastRank
      for (const rule of template.rules) {
        const fields = rule.fields[act]
        if (fields === undefined) continue
        const r = makeRank(prevRank, undefined)
        await client.createDoc(setting.class.WebhookIncomingRule, getCurrentEmployeeSpace(), {
          keyId: apiKey.keyId,
          name: `${template.label}: ${rule.name}`,
          enabled: true,
          rank: r,
          match: rule.match,
          forEach: rule.forEach,
          where: rule.where,
          action: act,
          target: tgt,
          fields,
          template: `${template.id}:${rule.name}`
        })
        prevRank = r
      }
      created = true
    } catch (err) {
      error = err instanceof Error ? err.message : String(err)
    } finally {
      saving = false
    }
  }

  const serviceUrl = getMetadata(setting.metadata.WebhookServiceUrl) ?? ''
  // Absolute, without the verb: this string is pasted into the sender's config as its webhook url,
  // and the service url is relative when the pod sits behind the front's own origin.
  const endpoint = new URL(concatLink(serviceUrl, '/api/v1/webhook/in'), window.location.origin).href

  async function copyText (text: string): Promise<void> {
    if (!window.isSecureContext) return
    await copyTextToClipboard(text)
  }
</script>

<Modal
  label={settingsRes.string.WebhookRuleFromTemplateTitle}
  labelProps={{ label: template.label }}
  type="type-popup"
  width="medium"
  okLabel={created ? presentation.string.Close : presentation.string.Create}
  okAction={created
    ? () => {
        dispatch('close', true)
      }
    : create}
  okLoading={saving}
  canSave={created || canCreate}
  showCancelButton={!created}
  onCancel={() => dispatch('close')}
>
  {#if !created}
    {#if availableOps.length === 0}
      <div class="hint warn"><Label label={settingsRes.string.WebhookRuleFromTemplateNoOps} /></div>
    {:else}
      <div class="fieldBlock">
        <Label label={settingsRes.string.WebhookConstructOperation} />
        <DropdownLabels items={opItems} bind:selected={action} kind="regular" size="medium" justify="left" />
      </div>
      <div class="fieldBlock">
        <Label label={settingsRes.string.WebhookConstructTarget} />
        <Button kind="regular" size="medium" justify="left" disabled={action === undefined} on:click={pickTarget}>
          <svelte:fragment slot="content">
            {#if target !== undefined}
              {target.label}
            {:else}
              <Label label={settingsRes.string.WebhookConstructPickTarget} />
            {/if}
          </svelte:fragment>
        </Button>
      </div>
    {/if}
    {#if error !== undefined}
      <div class="hint warn">{error}</div>
    {/if}
  {:else}
    <div class="fieldBlock">
      <Label label={settingsRes.string.WebhookIncomingEndpoint} />
      <div class="flex-row-center flex-gap-2">
        <code class="endpointUrl">{endpoint}</code>
        <Button
          kind="ghost"
          size="small"
          icon={IconCopy}
          showTooltip={{ label: view.string.CopyToClipboard }}
          on:click={() => {
            void copyText(endpoint)
          }}
        />
      </div>
      <div class="hint"><Label label={settingsRes.string.WebhookRuleFromTemplateAuthHint} /></div>
    </div>
  {/if}
</Modal>

<style lang="scss">
  .fieldBlock {
    display: flex;
    flex-direction: column;
    gap: 0.375rem;
    margin-bottom: 1rem;
  }
  .hint {
    color: var(--theme-dark-color);
    font-size: 0.8125rem;
  }
  .warn {
    color: var(--theme-error-color);
  }
  .endpointUrl {
    font-family: monospace;
    font-size: 0.8125rem;
    word-break: break-all;
  }
</style>
