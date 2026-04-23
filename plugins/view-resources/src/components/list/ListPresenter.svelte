<!--
// Copyright © 2022 Hardcore Engineering Inc.
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
  import contact, { PermissionsStore } from '@hcengineering/contact'
  import core, { AnyAttribute, Doc, Ref, TypedSpace } from '@hcengineering/core'
  import { getEmbeddedLabel, getResource, IntlString, translate } from '@hcengineering/platform'
  import { reduceCalls } from '@hcengineering/presentation'
  import { AttributeModel } from '@hcengineering/view'
  import { themeStore, tooltip } from '@hcengineering/ui'
  import { createEventDispatcher, onMount } from 'svelte'
  import { Readable } from 'svelte/store'
  import { canChangeAttribute, FixedColumn, restrictionStore } from '../..'
  import DividerPresenter from './DividerPresenter.svelte'

  function isEmpty (v: any): boolean {
    if (v === undefined || v === null || v === '') return true
    if (Array.isArray(v) && v.length === 0) return true
    return false
  }

  export let docObject: Doc
  export let attributeModel: AttributeModel
  export let onChange: ((value: any) => void) | undefined
  export let value: any
  export let props: Record<string, any>
  export let hideDivider: boolean = false
  export let compactMode: boolean = false
  export let readonly: boolean = false
  export let customStyle: 'pill' | 'square' = 'pill'

  const dispatch = createEventDispatcher()

  $: dp = attributeModel?.displayProps

  function formatScalar (v: any): string {
    if (v === undefined || v === null) return ''
    const t = typeof v
    if (t === 'string' || t === 'number' || t === 'boolean') return String(v)
    return ''
  }
  let customTooltipLabel: IntlString | undefined
  const computeCustomTooltip = reduceCalls(async function (model: AttributeModel, v: any): Promise<void> {
    const labelText = await translate(model.label, {}, $themeStore.language)
    const valueText = formatScalar(v)
    customTooltipLabel = getEmbeddedLabel(valueText !== '' ? `${labelText}: ${valueText}` : labelText)
  })
  $: if (dp?.custom === true) void computeCustomTooltip(attributeModel, value)

  function joinProps (attribute: AttributeModel, object: Doc, props: Record<string, any>, readonly: boolean) {
    const readonlyParams =
      readonly || (attribute?.attribute?.readonly ?? false)
        ? {
            readonly: true,
            disabled: true,
            editable: false,
            isEditable: false
          }
        : {}
    const clearAttributeProps = attribute.props
    if (attribute.attribute?.type._class === core.class.EnumOf) {
      return { ...clearAttributeProps, type: attribute.attribute.type, ...props, ...readonlyParams }
    }
    return { object, ...clearAttributeProps, space: object.space, ...props, ...readonlyParams }
  }
  const translateSize = (e: CustomEvent): void => {
    if (e.detail === undefined) return
    dispatch('resize', e.detail)
  }

  let permissionsStore: Readable<PermissionsStore> | undefined = undefined

  onMount(async () => {
    permissionsStore = await getResource(contact.store.Permissions)
  })

  function canChangeAttr (
    object: Doc,
    attr: AnyAttribute | undefined,
    permissionsStore: PermissionsStore | undefined
  ): boolean {
    if (attr === undefined) return true
    if (permissionsStore === undefined) return true
    return canChangeAttribute(attr, object.space as Ref<TypedSpace>, permissionsStore, object._class)
  }
</script>

{#if dp?.dividerBefore === true && !hideDivider}
  <DividerPresenter />
{/if}
{#if dp?.fixed}
  <FixedColumn key={`list_item_${dp.key}`} justify={dp.fixed}>
    <svelte:component
      this={attributeModel.presenter}
      {value}
      {onChange}
      kind={'list'}
      {compactMode}
      label={attributeModel.label}
      attribute={attributeModel.attribute}
      {...joinProps(
        attributeModel,
        docObject,
        props,
        readonly || $restrictionStore.readonly || !canChangeAttr(docObject, attributeModel.attribute, $permissionsStore)
      )}
      on:resize={translateSize}
    />
  </FixedColumn>
{:else if dp?.custom}
  {#if !isEmpty(value)}
    <div
      class="custom-attr-box"
      class:pill={customStyle === 'pill'}
      class:square={customStyle === 'square'}
      use:tooltip={{ label: customTooltipLabel ?? attributeModel.label }}
    >
      <div class="custom-attr-inner">
        <svelte:component
          this={attributeModel.presenter}
          {value}
          {onChange}
          kind={'list'}
          label={attributeModel.label}
          {compactMode}
          oneLine={true}
          attribute={attributeModel.attribute}
          {...joinProps(
            attributeModel,
            docObject,
            props,
            readonly ||
              $restrictionStore.readonly ||
              !canChangeAttr(docObject, attributeModel.attribute, $permissionsStore)
          )}
          on:resize={translateSize}
        />
      </div>
    </div>
  {/if}
{:else}
  <svelte:component
    this={attributeModel.presenter}
    {value}
    {onChange}
    kind={'list'}
    label={attributeModel.label}
    {compactMode}
    attribute={attributeModel.attribute}
    {...joinProps(
      attributeModel,
      docObject,
      props,
      readonly || $restrictionStore.readonly || !canChangeAttr(docObject, attributeModel.attribute, $permissionsStore)
    )}
    on:resize={translateSize}
  />
{/if}

<style lang="scss">
  .custom-attr-box {
    display: flex;
    align-items: center;
    justify-content: flex-start;
    flex-shrink: 0;
    padding: 0 0.75rem;
    height: 1.75rem;
    min-width: 0 !important;
    min-height: 0;
    max-width: 12rem;
    overflow: hidden;
    color: var(--theme-content-color);
    background-color: var(--theme-list-button-color);
    border: 1px solid var(--theme-button-border);
    user-select: none;

    &.pill {
      border-radius: 1.5rem;
    }
    &.square {
      height: 1.5rem;
      background-color: var(--theme-link-button-color);
      border-radius: 0.25rem;
    }
    &:hover {
      color: var(--theme-caption-color);
      border-color: var(--theme-list-divider-color);
    }
    &.square:hover {
      background-color: var(--theme-link-button-hover);
    }
  }
  .custom-attr-inner {
    display: block;
    min-width: 0 !important;
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    word-break: normal;
    line-height: 1;
  }
</style>
