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
  import { type ApiKeyInfo } from '@hcengineering/account-client'
  import { getCurrentEmployeeSpace } from '@hcengineering/contact'
  import { type Doc, SortingOrder } from '@hcengineering/core'
  import { MessageBox, createQuery, getClient } from '@hcengineering/presentation'
  import { makeRank } from '@hcengineering/rank'
  import setting, { type WebhookIncomingRule } from '@hcengineering/setting'
  import {
    Button,
    ButtonIcon,
    IconAdd,
    IconDelete,
    Label,
    Modal,
    SelectPopup,
    Toggle,
    eventToHTMLElement,
    showPopup,
    type SelectPopupValueType
  } from '@hcengineering/ui'
  import { SortableDocList } from '@hcengineering/view-resources'
  import { createEventDispatcher } from 'svelte'
  import settingsRes from '../plugin'
  import { webhookRuleTemplates } from '../webhookRuleTemplates'
  import WebhookRuleEditor from './WebhookRuleEditor.svelte'
  import WebhookRuleFromTemplate from './WebhookRuleFromTemplate.svelte'

  export let apiKey: ApiKeyInfo

  const client = getClient()
  const dispatch = createEventDispatcher()
  const query = { keyId: apiKey.keyId, space: getCurrentEmployeeSpace() }

  // Only the last rank is needed here (a new rule goes to the end); the list itself is
  // SortableDocList's.
  let lastRank: string | undefined
  const lastQuery = createQuery()
  lastQuery.query(
    setting.class.WebhookIncomingRule,
    query,
    (res) => {
      lastRank = res[0]?.rank
    },
    { sort: { rank: SortingOrder.Descending }, limit: 1 }
  )

  function toRule (doc: Doc): WebhookIncomingRule {
    return doc as WebhookIncomingRule
  }

  async function toggleEnabled (rule: WebhookIncomingRule): Promise<void> {
    await client.updateDoc(setting.class.WebhookIncomingRule, rule.space, rule._id, { enabled: !rule.enabled })
  }

  function openCreate (): void {
    showPopup(WebhookRuleEditor, { apiKey, rank: makeRank(lastRank, undefined) })
  }

  function openFromTemplate (event: MouseEvent): void {
    const items: SelectPopupValueType[] = webhookRuleTemplates.map((t) => ({ id: t.id, text: t.label }))
    showPopup(SelectPopup, { value: items, searchable: true }, eventToHTMLElement(event), (id?: string) => {
      if (id === undefined) return
      const tmpl = webhookRuleTemplates.find((t) => t.id === id)
      if (tmpl === undefined) return
      showPopup(WebhookRuleFromTemplate, { apiKey, template: tmpl, lastRank })
    })
  }

  function openEdit (rule: WebhookIncomingRule): void {
    showPopup(WebhookRuleEditor, { apiKey, existing: rule })
  }

  function remove (rule: WebhookIncomingRule): void {
    showPopup(MessageBox, {
      labelStr: rule.name,
      message: settingsRes.string.WebhookRuleDeleteConfirm,
      dangerous: true,
      okLabel: settingsRes.string.WebhookRuleDelete,
      action: async () => {
        await client.removeDoc(setting.class.WebhookIncomingRule, rule.space, rule._id)
      }
    })
  }
</script>

<Modal
  label={settingsRes.string.WebhookRules}
  type="type-popup"
  width="large"
  hideFooter
  onCancel={() => dispatch('close')}
>
  <div class="toolbar">
    <Button kind="regular" icon={IconAdd} label={settingsRes.string.CreateWebhookRule} on:click={openCreate} />
    <Button kind="regular" label={settingsRes.string.WebhookRuleFromTemplate} on:click={openFromTemplate} />
  </div>
  <div class="hulyTableAttr-container">
    {#if lastRank === undefined}
      <div class="empty"><Label label={settingsRes.string.NoWebhookRules} /></div>
    {/if}
    <SortableDocList _class={setting.class.WebhookIncomingRule} {query}>
      <svelte:fragment slot="object" let:value>
        {@const rule = toRule(value)}
        <div class="row">
          <Toggle
            on={rule.enabled}
            on:change={() => {
              void toggleEnabled(rule)
            }}
          />
          <button
            type="button"
            class="ruleButton"
            class:dimmed={!rule.enabled}
            on:click={() => {
              openEdit(rule)
            }}
          >
            <span class="name overflow-label">{rule.name}</span>
            <span class="mono dim overflow-label">{rule.action}</span>
            <span class="dim overflow-label">{rule.target.label}</span>
          </button>
          <ButtonIcon
            kind="tertiary"
            size="small"
            icon={IconDelete}
            on:click={() => {
              remove(rule)
            }}
          />
        </div>
      </svelte:fragment>
    </SortableDocList>
  </div>
</Modal>

<style lang="scss">
  .empty {
    padding: var(--spacing-2);
    color: var(--theme-dark-color);
  }
  .row {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    align-items: center;
    gap: 0.5rem;
    flex-grow: 1;
    min-width: 0;
    padding: 0.25rem 0.5rem 0.25rem 0.75rem;
  }
  // Fixed action/target tracks, so the columns line up across rows whatever the rule is called.
  .ruleButton {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 7rem 8rem;
    gap: 1rem;
    align-items: center;
    min-width: 0;
    padding: 0.5rem 0.75rem;
    text-align: left;
    border-radius: 0.375rem;

    &:hover {
      background: var(--theme-button-hovered);
    }
  }
  .toolbar {
    display: flex;
    gap: 0.5rem;
    margin-bottom: 0.75rem;
  }
  .dimmed {
    opacity: 0.5;
  }
  .name {
    font-weight: 500;
  }
  .mono {
    font-family: monospace;
  }
  .dim {
    color: var(--theme-dark-color);
    font-size: 0.8125rem;
  }
</style>
