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
  import core, { type Doc, type DocumentUpdate, type Rank } from '@hcengineering/core'
  import { translate } from '@hcengineering/platform'
  import presentation, { getClient, MessageViewer } from '@hcengineering/presentation'
  import { makeRank } from '@hcengineering/rank'
  import setting, {
    evaluateWebhookRule,
    WEBHOOK_RULE_MAX_JOBS,
    type WebhookIncomingRule,
    type WebhookRuleCondition,
    type WebhookRuleEvaluation,
    type WebhookRuleOp,
    type WebhookRuleTarget
  } from '@hcengineering/setting'
  import { themeStore } from '@hcengineering/theme'
  import {
    Button,
    ButtonIcon,
    DropdownLabels,
    DropdownLabelsIntl,
    DropdownLabelsPopup,
    IconAdd,
    IconDelete,
    Label,
    Modal,
    ModernEditbox,
    eventToHTMLElement,
    showPopup,
    type DropdownIntlItem,
    type DropdownTextItem
  } from '@hcengineering/ui'
  import { jsonToMarkup } from '@hcengineering/text'
  import { markdownToMarkup } from '@hcengineering/text-markdown'
  import settingsRes from '../plugin'
  import { listWebhookPaths, type WebhookSamplePath } from '../webhookSamplePaths'
  import { webhookRuleTemplates, type WebhookRuleTemplate, type WebhookRuleTemplateRule } from '../webhookRuleTemplates'
  import { targetKind, webhookOpFieldNames } from '../webhookTargetKind'
  import WebhookTargetPicker from './WebhookTargetPicker.svelte'
  import { createEventDispatcher } from 'svelte'

  export let apiKey: ApiKeyInfo
  export let existing: WebhookIncomingRule | undefined = undefined
  // Only used when `existing` is undefined - where the new rule lands in the key's rank order.
  export let rank: Rank | undefined = undefined

  interface TargetLike extends Doc {
    identifier?: string
    name?: string
    title?: string
  }

  interface ConditionDraft {
    path: string
    op: WebhookRuleOp
    value: string
  }

  interface FieldDraft {
    key: string
    template: string
  }

  const client = getClient()
  const dispatch = createEventDispatcher()
  // Only granted operations are offered - an unrestricted key is granted every operation.
  const grantedOps = apiKey.unrestricted === true ? [...apiKeyOperations] : apiKey.ops

  function conditionsFromRule (rule: WebhookRuleCondition[]): ConditionDraft[] {
    return rule.map((c) => ({
      path: c.path,
      op: c.op,
      value: Array.isArray(c.value) ? c.value.join(', ') : (c.value ?? '')
    }))
  }

  let name = existing?.name ?? ''
  let action: ApiKeyOperation | undefined = existing?.action
  let target: WebhookRuleTarget | undefined = existing?.target
  let forEachPath = existing?.forEach ?? ''
  let conditions: ConditionDraft[] = conditionsFromRule(existing?.match ?? [])
  let whereConditions: ConditionDraft[] = conditionsFromRule(existing?.where ?? [])
  let fieldRows: FieldDraft[] = Object.entries(existing?.fields ?? {}).map(([key, template]) => ({ key, template }))
  let saving = false
  let error: string | undefined

  // Preselected for a rule created from a template, so its sample loads and the pickers work
  // immediately even though a rule's originating request body is never stored.
  let sourceSelected: string | number = existing?.template ?? 'custom'
  let selectedTemplate: WebhookRuleTemplate | undefined
  let selectedRule: WebhookRuleTemplateRule | undefined
  // Operation the field rows were last filled for; the template refills them when it changes.
  let filledAction: ApiKeyOperation | undefined = existing?.action

  let customLabel = ''
  let noneLabel = ''
  let sampleBodyPlaceholder = ''
  $: void translate(settingsRes.string.Custom, {}, $themeStore.language).then((v) => {
    customLabel = v
  })
  $: void translate(settingsRes.string.WebhookRuleForEachNone, {}, $themeStore.language).then((v) => {
    noneLabel = v
  })
  $: void translate(settingsRes.string.WebhookRuleSampleBodyPlaceholder, {}, $themeStore.language).then((v) => {
    sampleBodyPlaceholder = v
  })
  // One item per template rule (`alertmanager:firing`): a source is a ready rule, not just a body.
  $: sourceItems = [
    { id: 'custom', label: customLabel },
    ...webhookRuleTemplates.flatMap((t) =>
      t.rules.map((r): DropdownTextItem => ({ id: `${t.id}:${r.name}`, label: `${t.label}: ${r.name}` }))
    )
  ]

  function parseSample (text: string): { parsed: unknown, error: string | undefined } {
    const trimmed = text.trim()
    if (trimmed === '') return { parsed: undefined, error: undefined }
    try {
      return { parsed: JSON.parse(trimmed), error: undefined }
    } catch (err) {
      return { parsed: undefined, error: err instanceof Error ? err.message : String(err) }
    }
  }

  let sampleBodyText = ''
  let sampleParsed: unknown
  let sampleError: string | undefined
  // Must stay above the parse statement: Svelte keeps source order here, and everything derived
  // from the sample (paths, pickers, preview) has to see the text the template just put in.
  $: onSourceChange(sourceSelected)
  $: ({ parsed: sampleParsed, error: sampleError } = parseSample(sampleBodyText))

  $: samplePaths = sampleParsed !== undefined ? listWebhookPaths(sampleParsed) : []

  // Paths relative to the forEach array's first element, for the `where` picker.
  function elementRelativePaths (paths: WebhookSamplePath[], forEach: string): WebhookSamplePath[] {
    const prefix = `${forEach}.0.`
    return paths.filter((p) => p.path.startsWith(prefix)).map((p) => ({ ...p, path: p.path.slice(prefix.length) }))
  }
  $: whereSamplePaths = forEachPath.trim() !== '' ? elementRelativePaths(samplePaths, forEachPath.trim()) : []

  function fillFields (rule: WebhookRuleTemplateRule, op: ApiKeyOperation): void {
    fieldRows = Object.entries(rule.fields[op] ?? {}).map(([key, template]) => ({ key, template }))
    filledAction = op
  }

  // The source the form currently reflects. Opening an existing rule only loads its sample;
  // the rule itself is overwritten from a template only when the user picks another source.
  let appliedSource: string | number = sourceSelected

  function onSourceChange (id: string | number): void {
    const [templateId, ruleName] = String(id).split(':')
    const tmpl = webhookRuleTemplates.find((t) => t.id === templateId)
    selectedTemplate = tmpl
    selectedRule = tmpl?.rules.find((r) => r.name === ruleName)
    if (tmpl === undefined) return
    sampleBodyText = JSON.stringify(tmpl.sample, null, 2)
    if (id === appliedSource || selectedRule === undefined) return
    appliedSource = id

    conditions = conditionsFromRule(selectedRule.match)
    forEachPath = selectedRule.forEach ?? ''
    whereConditions = conditionsFromRule(selectedRule.where ?? [])
    if (name.trim() === '') name = `${tmpl.label}: ${selectedRule.name}`
    const ops = grantedOps.filter((o) => selectedRule?.fields[o] !== undefined)
    if (action === undefined || !ops.includes(action)) action = ops[0]
    if (action !== undefined) fillFields(selectedRule, action)
  }

  const opItems: DropdownIntlItem[] = [
    { id: 'eq', label: settingsRes.string.WebhookRuleOpEq },
    { id: 'neq', label: settingsRes.string.WebhookRuleOpNeq },
    { id: 'exists', label: settingsRes.string.WebhookRuleOpExists },
    { id: 'regex', label: settingsRes.string.WebhookRuleOpRegex },
    { id: 'in', label: settingsRes.string.WebhookRuleOpIn }
  ]

  // With a template source only the operations that template has a mapping for make sense:
  // an alert can become a message or an issue, but there is nothing for it to `issue:update`.
  $: actionItems = grantedOps
    .filter((o) => selectedRule === undefined || selectedRule.fields[o] !== undefined)
    .map((o): DropdownTextItem => ({ id: o, label: o }))
  $: fieldSuggestions =
    action !== undefined ? webhookOpFieldNames(action).filter((k) => !fieldRows.some((r) => r.key === k)) : []

  // Same kind can carry several operations (issue:update/comment/time_report all target an Issue) -
  // only a kind change invalidates the target already picked.
  function onActionChange (next: ApiKeyOperation | undefined): void {
    if (next === undefined) {
      target = undefined
      return
    }
    if (selectedRule !== undefined && next !== filledAction) fillFields(selectedRule, next)
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

  function addCondition (): void {
    conditions = [...conditions, { path: '', op: 'eq', value: '' }]
  }

  function removeCondition (index: number): void {
    conditions = conditions.filter((_, i) => i !== index)
  }

  function addWhereCondition (): void {
    whereConditions = [...whereConditions, { path: '', op: 'eq', value: '' }]
  }

  function removeWhereCondition (index: number): void {
    whereConditions = whereConditions.filter((_, i) => i !== index)
  }

  function addSuggestedField (key: string): void {
    fieldRows = [...fieldRows, { key, template: '' }]
  }

  function removeField (index: number): void {
    fieldRows = fieldRows.filter((_, i) => i !== index)
  }

  // `{{path}}` is relative to the forEach element (or the root without one), `{{$.path}}` always
  // reaches the root.
  function fieldInsertText (path: string): string {
    const fe = forEachPath.trim()
    if (fe === '') return `{{${path}}}`
    if (path === fe) return '{{}}'
    // The picker addresses the sample's first element as `alerts.0.x`; inside forEach that is just `x`.
    if (path.startsWith(`${fe}.`)) return `{{${path.slice(fe.length + 1).replace(/^\d+\.?/, '')}}}`
    return `{{$.${path}}}`
  }

  // Current value first (even if it fell out of a freshly pasted sample), then the sample's paths.
  function pathItems (paths: WebhookSamplePath[], current: string): DropdownTextItem[] {
    const items = paths.map((p): DropdownTextItem => ({ id: p.path, label: `${p.path} - ${p.preview}` }))
    if (current.trim() !== '' && !paths.some((p) => p.path === current)) {
      items.unshift({ id: current, label: current })
    }
    return items
  }

  // Element-relative paths (inside the current forEach) sorted first.
  function fieldPickerItems (paths: WebhookSamplePath[], forEach: string): DropdownTextItem[] {
    const fe = forEach.trim()
    const isRelative = (p: WebhookSamplePath): boolean => fe !== '' && (p.path === fe || p.path.startsWith(`${fe}.`))
    const sorted = [...paths].sort((a, b) => Number(isRelative(b)) - Number(isRelative(a)))
    return sorted.map((p): DropdownTextItem => ({ id: p.path, label: `${p.path} - ${p.preview}` }))
  }

  function pickFieldValue (event: MouseEvent, index: number): void {
    if (samplePaths.length === 0) return
    showPopup(
      DropdownLabelsPopup,
      { items: fieldPickerItems(samplePaths, forEachPath), enableSearch: true },
      eventToHTMLElement(event),
      (result?: DropdownTextItem['id']) => {
        if (result === undefined) return
        fieldRows[index].template += fieldInsertText(String(result))
        fieldRows = fieldRows
      }
    )
  }

  function toCondition (c: ConditionDraft): WebhookRuleCondition {
    if (c.op === 'exists') return { path: c.path.trim(), op: c.op }
    if (c.op === 'in') {
      return {
        path: c.path.trim(),
        op: c.op,
        value: c.value
          .split(',')
          .map((v) => v.trim())
          .filter((v) => v.length > 0)
      }
    }
    return { path: c.path.trim(), op: c.op, value: c.value }
  }

  $: match = conditions.map(toCondition)
  $: fields = Object.fromEntries(
    fieldRows.filter((r) => r.key.trim().length > 0).map((r) => [r.key.trim(), r.template])
  )
  $: forEachValue = forEachPath.trim() !== '' ? forEachPath.trim() : undefined
  $: whereValue =
    forEachValue !== undefined && whereConditions.length > 0 ? whereConditions.map(toCondition) : undefined

  // Fields pod-webhook treats as markdown (markdownFields in its operations.ts) - previewed the
  // way consumer.ts converts them, so the preview is what lands in the channel or the issue.
  const markdownFieldNames = new Set(['message', 'body', 'description', 'content'])

  let previewResult: WebhookRuleEvaluation | undefined
  let previewError: string | undefined
  $: {
    if (sampleParsed === undefined) {
      previewResult = undefined
      previewError = undefined
    } else {
      try {
        previewResult = evaluateWebhookRule({ match, forEach: forEachValue, where: whereValue, fields }, sampleParsed)
        previewError = undefined
      } catch (err) {
        previewResult = undefined
        previewError = err instanceof Error ? err.message : String(err)
      }
    }
  }

  $: matchValid = conditions.every((c) => c.path.trim().length > 0 && (c.op === 'exists' || c.value.trim().length > 0))
  $: whereValid = whereConditions.every(
    (c) => c.path.trim().length > 0 && (c.op === 'exists' || c.value.trim().length > 0)
  )
  $: canSave =
    !saving && name.trim().length > 0 && action !== undefined && target !== undefined && matchValid && whereValid

  async function save (): Promise<void> {
    if (!canSave || action === undefined || target === undefined) return
    saving = true
    error = undefined
    try {
      if (existing === undefined) {
        await client.createDoc(setting.class.WebhookIncomingRule, getCurrentEmployeeSpace(), {
          keyId: apiKey.keyId,
          name: name.trim(),
          enabled: true,
          rank: rank ?? makeRank(undefined, undefined),
          match,
          forEach: forEachValue,
          where: whereValue,
          action,
          target,
          fields,
          template: selectedRule !== undefined ? String(sourceSelected) : undefined
        })
      } else {
        const upd: DocumentUpdate<WebhookIncomingRule> = {}
        const unset: Partial<Record<'forEach' | 'where' | 'template', true>> = {}
        const templateValue = selectedTemplate !== undefined ? String(sourceSelected) : undefined
        if (templateValue !== existing.template) {
          if (templateValue === undefined) unset.template = true
          else upd.template = templateValue
        }
        if (name.trim() !== existing.name) upd.name = name.trim()
        if (JSON.stringify(match) !== JSON.stringify(existing.match)) upd.match = match
        if (forEachValue !== existing.forEach) {
          if (forEachValue === undefined) unset.forEach = true
          else upd.forEach = forEachValue
        }
        if (JSON.stringify(whereValue) !== JSON.stringify(existing.where)) {
          if (whereValue === undefined) unset.where = true
          else upd.where = whereValue
        }
        if (action !== existing.action) upd.action = action
        if (JSON.stringify(target) !== JSON.stringify(existing.target)) upd.target = target
        if (JSON.stringify(fields) !== JSON.stringify(existing.fields)) upd.fields = fields
        if (Object.keys(unset).length > 0) upd.$unset = unset
        if (Object.keys(upd).length > 0) {
          await client.updateDoc(setting.class.WebhookIncomingRule, existing.space, existing._id, upd)
        }
      }
      dispatch('close', true)
    } catch (err) {
      error = err instanceof Error ? err.message : String(err)
    } finally {
      saving = false
    }
  }
</script>

<Modal
  label={existing === undefined ? settingsRes.string.CreateWebhookRule : settingsRes.string.EditWebhookRule}
  type="type-popup"
  okLabel={existing === undefined ? presentation.string.Create : presentation.string.Save}
  okAction={save}
  okLoading={saving}
  {canSave}
  showCancelButton={false}
  onCancel={() => dispatch('close')}
>
  <div class="grid">
    <div class="leftCol">
      <div class="fieldBlock">
        <Label label={settingsRes.string.WebhookRuleSource} />
        <DropdownLabels
          items={sourceItems}
          bind:selected={sourceSelected}
          kind="regular"
          size="medium"
          justify="left"
        />
        {#if selectedTemplate !== undefined}
          <a class="docsLink" href={selectedTemplate.docsUrl} target="_blank" rel="noreferrer">
            <Label label={settingsRes.string.WebhookRuleTemplateDocsLink} params={{ label: selectedTemplate.label }} />
          </a>
        {/if}
      </div>

      <div class="fieldBlock grow">
        <Label label={settingsRes.string.WebhookRuleSampleBody} />
        <textarea
          class="pathInput sampleTextarea"
          spellcheck="false"
          bind:value={sampleBodyText}
          placeholder={sampleBodyPlaceholder}
        />
        {#if sampleError !== undefined}
          <div class="hint warn">
            <Label label={settingsRes.string.WebhookRuleSampleBodyInvalid} params={{ error: sampleError }} />
          </div>
        {/if}
      </div>
    </div>

    <div class="rightCol">
      <ModernEditbox bind:value={name} label={core.string.Name} size="medium" autoFocus />

      <div class="row">
        <div class="fieldBlock grow">
          <Label label={settingsRes.string.WebhookConstructOperation} />
          <DropdownLabels items={actionItems} bind:selected={action} kind="regular" size="medium" justify="left" />
        </div>

        <div class="fieldBlock grow">
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
      </div>

      {#if samplePaths.length === 0}
        <div class="hint"><Label label={settingsRes.string.WebhookRuleNoSampleHint} /></div>
      {/if}

      <div class="fieldBlock">
        <div class="flex-row-center flex-between">
          <Label label={settingsRes.string.WebhookRuleConditions} />
          <ButtonIcon
            kind="tertiary"
            size="small"
            icon={IconAdd}
            disabled={samplePaths.length === 0}
            on:click={addCondition}
          />
        </div>
        {#each conditions as condition, i (i)}
          <div class="conditionRow">
            {#if samplePaths.length > 0}
              <DropdownLabels
                items={pathItems(samplePaths, condition.path)}
                bind:selected={condition.path}
                kind="regular"
                size="small"
                justify="left"
                width="100%"
                label={settingsRes.string.WebhookRulePickPath}
              />
            {:else}
              <span class="pathText mono overflow-label">{condition.path !== '' ? condition.path : '-'}</span>
            {/if}
            <DropdownLabelsIntl items={opItems} bind:selected={condition.op} kind="regular" size="small" />
            {#if condition.op !== 'exists'}
              <ModernEditbox
                bind:value={condition.value}
                label={condition.op === 'in'
                  ? settingsRes.string.WebhookRuleValuesPlaceholder
                  : settingsRes.string.WebhookRulePathPlaceholder}
                size="small"
              />
            {/if}
            <ButtonIcon
              kind="tertiary"
              size="small"
              icon={IconDelete}
              on:click={() => {
                removeCondition(i)
              }}
            />
          </div>
        {/each}
      </div>

      <div class="fieldBlock">
        <Label label={settingsRes.string.WebhookRuleForEach} />
        <DropdownLabels
          items={[
            { id: '', label: noneLabel },
            ...pathItems(
              samplePaths.filter((p) => p.isArray),
              forEachPath
            )
          ]}
          bind:selected={forEachPath}
          kind="regular"
          size="medium"
          justify="left"
          width="100%"
          disabled={samplePaths.length === 0 && forEachPath.trim() === ''}
          label={settingsRes.string.WebhookRulePickPath}
        />
      </div>

      {#if forEachValue !== undefined}
        <div class="fieldBlock">
          <div class="flex-row-center flex-between">
            <Label label={settingsRes.string.WebhookRuleWhere} />
            <ButtonIcon
              kind="tertiary"
              size="small"
              icon={IconAdd}
              disabled={whereSamplePaths.length === 0}
              on:click={addWhereCondition}
            />
          </div>
          {#each whereConditions as condition, i (i)}
            <div class="conditionRow">
              {#if whereSamplePaths.length > 0}
                <DropdownLabels
                  items={pathItems(whereSamplePaths, condition.path)}
                  bind:selected={condition.path}
                  kind="regular"
                  size="small"
                  justify="left"
                  width="100%"
                  label={settingsRes.string.WebhookRulePickPath}
                />
              {:else}
                <span class="pathText mono overflow-label">{condition.path !== '' ? condition.path : '-'}</span>
              {/if}
              <DropdownLabelsIntl items={opItems} bind:selected={condition.op} kind="regular" size="small" />
              {#if condition.op !== 'exists'}
                <ModernEditbox
                  bind:value={condition.value}
                  label={condition.op === 'in'
                    ? settingsRes.string.WebhookRuleValuesPlaceholder
                    : settingsRes.string.WebhookRulePathPlaceholder}
                  size="small"
                />
              {/if}
              <ButtonIcon
                kind="tertiary"
                size="small"
                icon={IconDelete}
                on:click={() => {
                  removeWhereCondition(i)
                }}
              />
            </div>
          {/each}
        </div>
      {/if}

      <div class="fieldBlock">
        <Label label={settingsRes.string.WebhookRuleFields} />
        {#if fieldSuggestions.length > 0}
          <div class="chips">
            {#each fieldSuggestions as suggestion (suggestion)}
              <button
                type="button"
                class="suggestionChip"
                on:click={() => {
                  addSuggestedField(suggestion)
                }}
              >
                {suggestion}
              </button>
            {/each}
          </div>
        {/if}
        {#each fieldRows as row, i (i)}
          <div class="fieldRow">
            <div class="fieldToolbar">
              <span class="key mono">{row.key}</span>
              <Button
                kind="ghost"
                size="small"
                label={settingsRes.string.WebhookRuleInsertValue}
                disabled={samplePaths.length === 0}
                on:click={(e) => {
                  pickFieldValue(e, i)
                }}
              />
              <ButtonIcon
                kind="tertiary"
                size="small"
                icon={IconDelete}
                on:click={() => {
                  removeField(i)
                }}
              />
            </div>
            <textarea class="pathInput templateInput" rows="6" spellcheck="false" bind:value={row.template} />
          </div>
        {/each}
      </div>

      <div class="fieldBlock">
        <Label label={settingsRes.string.WebhookRulePreview} />
        {#if sampleParsed === undefined}
          <div class="hint"><Label label={settingsRes.string.WebhookRulePreviewNoSample} /></div>
        {:else if previewError !== undefined}
          <div class="hint warn">
            <Label label={settingsRes.string.WebhookRulePreviewError} params={{ error: previewError }} />
          </div>
        {:else if previewResult !== undefined}
          <div class="preview">
            {#each previewResult.conditions as cond (cond.condition.path + cond.condition.op)}
              <div class="previewCondition">
                <span class="mono">{cond.condition.path}</span>
                <span class="mono dim">{JSON.stringify(cond.actual)}</span>
                <span class:ok={cond.passed} class:fail={!cond.passed}>
                  <Label
                    label={cond.passed
                      ? settingsRes.string.WebhookRuleConditionPassed
                      : settingsRes.string.WebhookRuleConditionFailed}
                  />
                </span>
              </div>
            {/each}
            <div class:ok={previewResult.matched} class:fail={!previewResult.matched}>
              <Label
                label={previewResult.matched
                  ? settingsRes.string.WebhookRulePreviewMatched
                  : settingsRes.string.WebhookRulePreviewNotMatched}
              />
            </div>
            {#if previewResult.items.length > 0}
              <div class="hint">
                <Label
                  label={settingsRes.string.WebhookRulePreviewItems}
                  params={{ count: previewResult.items.length }}
                />
              </div>
              {#if previewResult.items.length > WEBHOOK_RULE_MAX_JOBS}
                <div class="hint warn">
                  <Label label={settingsRes.string.WebhookRulePreviewTooMany} params={{ max: WEBHOOK_RULE_MAX_JOBS }} />
                </div>
              {/if}
              {#each previewResult.items as item, i (i)}
                <div class="previewItem">
                  {#each Object.entries(item) as [key, text] (key)}
                    <div class="mono key">{key}</div>
                    {#if markdownFieldNames.has(key)}
                      <div class="previewText"><MessageViewer message={jsonToMarkup(markdownToMarkup(text))} /></div>
                    {:else}
                      <div class="previewText">{text}</div>
                    {/if}
                  {/each}
                </div>
              {/each}
            {/if}
          </div>
        {/if}
      </div>

      {#if error !== undefined}
        <div class="hint warn">{error}</div>
      {/if}
    </div>
  </div>
</Modal>

<style lang="scss">
  .grid {
    display: grid;
    grid-template-columns: minmax(0, 2fr) minmax(0, 3fr);
    gap: 1.5rem;
    width: min(76rem, 88vw);

    @media (max-width: 60rem) {
      grid-template-columns: 1fr;
    }
  }
  .leftCol,
  .rightCol {
    display: flex;
    flex-direction: column;
    gap: 1rem;
    min-width: 0;
  }
  .row {
    display: flex;
    gap: 1rem;
  }
  .grow {
    flex: 1;
    min-width: 0;
  }
  // Колонки одной высоты (grid stretch), так что образец растёт до низа правой;
  // min-height - только для одноколоночной раскладки.
  .sampleTextarea {
    flex: 1;
    min-height: 20rem;
    resize: vertical;
  }
  .fieldBlock {
    display: flex;
    flex-direction: column;
    gap: 0.375rem;
  }
  .hint {
    color: var(--theme-dark-color);
    font-size: 0.8125rem;
  }
  .warn {
    color: var(--theme-error-color);
  }
  .docsLink {
    font-size: 0.75rem;
    color: var(--theme-content-color);
    text-decoration: underline;
  }
  // Plain input, not ModernEditbox: a template mixes literal text with inserted `{{path}}` values,
  // and the sample box needs a native `spellcheck` attribute ModernEditbox/TextArea don't expose.
  .pathInput {
    width: 100%;
    padding: 0.375rem 0.5rem;
    font-size: 0.8125rem;
    font-family: monospace;
    color: var(--input-TextColor);
    background-color: var(--input-BackgroundColor);
    box-shadow: inset 0 0 0 1px var(--input-BorderColor);
    border: none;
    border-radius: var(--medium-BorderRadius);
    outline: none;

    &:focus {
      outline: 2px solid var(--global-focus-BorderColor);
      outline-offset: 2px;
    }
  }
  .pathText {
    padding: 0.375rem 0.5rem;
    font-size: 0.8125rem;
    color: var(--theme-dark-color);
  }
  .conditionRow {
    display: grid;
    grid-template-columns: 1.5fr auto 1fr auto;
    gap: 0.375rem;
    align-items: center;
  }
  .fieldRow {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }
  .fieldToolbar {
    display: flex;
    align-items: center;
    gap: 0.375rem;

    .key {
      flex-grow: 1;
    }
  }
  .templateInput {
    font-family: monospace;
    resize: vertical;
  }
  // Rendered as the receiver will see it: real line breaks, not JSON-escaped `\n`.
  .previewText {
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }
  .key {
    padding: 0 0.25rem;
    font-size: 0.8125rem;
    white-space: nowrap;
  }
  .chips {
    display: flex;
    flex-wrap: wrap;
    gap: 0.375rem;
  }
  .suggestionChip {
    padding: 0.125rem 0.5rem;
    font-size: 0.75rem;
    font-family: monospace;
    color: var(--theme-dark-color);
    background: var(--theme-button-default);
    border: none;
    border-radius: 0.5rem;
    cursor: pointer;

    &:hover {
      background: var(--theme-button-hovered);
    }
  }
  .preview {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    font-size: 0.8125rem;
  }
  .previewCondition {
    display: flex;
    gap: 0.5rem;
    align-items: baseline;
  }
  .mono {
    font-family: monospace;
  }
  .dim {
    color: var(--theme-dark-color);
  }
  .ok {
    color: var(--theme-won-color);
  }
  .fail {
    color: var(--theme-error-color);
  }
  .previewItem {
    max-width: 100%;
    max-height: 10rem;
    overflow: auto;
    margin: 0;
    padding: 0.5rem;
    background: var(--theme-bg-color);
    border: 1px solid var(--theme-divider-color);
    border-radius: 0.375rem;
  }
</style>
