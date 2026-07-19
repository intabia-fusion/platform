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
  import core, { Class, ClassifierKind, Doc, Rank, Ref } from '@hcengineering/core'
  import { getEmbeddedLabel } from '@hcengineering/platform'
  import { MessageBox, createQuery, getClient } from '@hcengineering/presentation'
  import { makeRank, toRank } from '@hcengineering/rank'
  import {
    getColorNumberByText,
    getPlatformColor,
    IconAdd,
    IconSettings,
    Label,
    ModernButton,
    showPopup,
    themeStore
  } from '@hcengineering/ui'
  import { SortableList, deleteObject } from '@hcengineering/view-resources'
  import setting from '../plugin'
  import ClassAttributes from './ClassAttributes.svelte'
  import CreateMixin from './CreateMixin.svelte'

  export let _class: Ref<Class<Doc>>
  export let disabled: boolean = true

  const client = getClient()
  const hierarchy = client.getHierarchy()

  const embeddedPrefix = getEmbeddedLabel('')
  function isGeneratedTargetClass (cls: Class<Doc>): boolean {
    return cls.label.startsWith(embeddedPrefix) && !hierarchy.hasMixin(cls, setting.mixin.UserMixin)
  }

  function getRank (m: Class<Doc>): Rank | undefined {
    if (hierarchy.hasMixin(m, setting.mixin.ClassifierOrder)) {
      return hierarchy.as(m, setting.mixin.ClassifierOrder).rank
    }
    return toRank(m._id)
  }

  let mixins: Class<Doc>[] = []
  const query = createQuery()
  $: query.query(core.class.Class, { extends: _class, kind: ClassifierKind.MIXIN }, (res) => {
    mixins = res
      .filter(
        (cls) =>
          cls.hidden !== true &&
          cls.label !== undefined &&
          !isGeneratedTargetClass(cls) &&
          (!hierarchy.hasMixin(cls, setting.mixin.Editable) || hierarchy.as(cls, setting.mixin.Editable).value)
      )
      .sort((a, b) => (getRank(a) ?? '').localeCompare(getRank(b) ?? ''))
  })

  async function moveHandler (e: CustomEvent<any>): Promise<void> {
    if (disabled) return
    const { item, prev, next } = e.detail as { item: Class<Doc>, prev?: Class<Doc>, next?: Class<Doc> }
    const rank = makeRank(
      prev !== undefined ? getRank(prev) : undefined,
      next !== undefined ? getRank(next) : undefined
    )
    if (hierarchy.hasMixin(item, setting.mixin.ClassifierOrder)) {
      await client.updateMixin(item._id, item._class, item.space, setting.mixin.ClassifierOrder, { rank })
    } else {
      await client.createMixin(item._id, item._class, item.space, setting.mixin.ClassifierOrder, { rank })
    }
  }

  function createMixin (): void {
    showPopup(CreateMixin, { value: hierarchy.getClass(_class) }, 'top')
  }

  async function deleteMixin (m: Class<Doc>): Promise<void> {
    const exist = (await client.findAll(m._id, {}, { limit: 1 })).length > 0
    showPopup(
      MessageBox,
      {
        label: setting.string.DeleteMixin,
        message: exist ? setting.string.DeleteMixinExistConfirm : setting.string.DeleteMixinConfirm,
        action: async () => {
          await deleteObject(client, m)
        }
      },
      'top'
    )
  }
</script>

<div class="hulyTableAttr-header font-medium-12 withButton mixinsHeader">
  <div class="flex-row-center">
    <IconSettings size={'small'} />
    <span class="ml-2"><Label label={setting.string.Mixins} /></span>
  </div>
  {#if !disabled}
    <ModernButton icon={IconAdd} label={setting.string.CreateMixin} size={'small'} on:click={createMixin} />
  {/if}
</div>
{#if mixins.length > 0}
  {#if disabled}
    {#each mixins as mixin (mixin._id)}
      {@const barColor = getPlatformColor(getColorNumberByText(mixin._id), $themeStore.dark)}
      <div class="mixinItem" style:border-left={`3px solid ${barColor}`}>
        <ClassAttributes _class={mixin._id} disabled showHeader mixinHeader flat />
      </div>
    {/each}
  {:else}
    <SortableList bind:items={mixins} on:move={moveHandler}>
      <svelte:fragment slot="object" let:value={mixin}>
        {@const barColor = getPlatformColor(getColorNumberByText(mixin._id), $themeStore.dark)}
        <div class="mixinItem" style:border-left={`3px solid ${barColor}`}>
          <ClassAttributes
            _class={mixin._id}
            {disabled}
            showHeader
            mixinHeader
            flat
            onDelete={() => deleteMixin(mixin)}
          />
        </div>
      </svelte:fragment>
    </SortableList>
  {/if}
{/if}

<style lang="scss">
  .mixinsHeader {
    border-top: 1px solid var(--theme-divider-color);
  }
  .mixinItem {
    margin-top: var(--spacing-1_5);
  }
</style>
