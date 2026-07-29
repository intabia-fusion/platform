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
  import { Class, Doc, Ref } from '@hcengineering/core'
  import { getClient } from '@hcengineering/presentation'
  import setting, { settingId } from '@hcengineering/setting'
  import { Button, getCurrentResolvedLocation, navigate } from '@hcengineering/ui'
  import { restrictionStore } from '../utils'

  export let _class: Ref<Class<Doc>>

  const hierarchy = getClient().getHierarchy()

  // The class editor edits real classes; a mixin is configured under its base
  // class (e.g. contact:mixin:Employee -> contact:class:Person), where it shows
  // in the MIXINS section. Resolve the mixin to its base class for navigation.
  function baseClassOf (cl: Ref<Class<Doc>>): Ref<Class<Doc>> {
    try {
      return hierarchy.isMixin(cl) ? hierarchy.getBaseClass(cl) : cl
    } catch {
      return cl
    }
  }

  // Editable if the class or any ancestor is marked setting.mixin.Editable with value true
  // (and none marks it false), matching the class editor's own rule.
  function isEditable (cl: Ref<Class<Doc>>): boolean {
    let result = false
    try {
      for (const anc of [...hierarchy.getAncestors(cl), cl]) {
        const c = hierarchy.getClass(anc)
        if (hierarchy.hasMixin(c, setting.mixin.Editable)) {
          if (hierarchy.as(c, setting.mixin.Editable).value) result = true
          else return false
        }
      }
    } catch {
      return false
    }
    return result
  }

  $: target = baseClassOf(_class)
  $: visible = isEditable(target) && !$restrictionStore.disableNavigation

  function openClassSettings (ev: MouseEvent): void {
    ev.stopPropagation()
    const loc = getCurrentResolvedLocation()
    loc.path[2] = settingId
    loc.path[3] = 'setting'
    loc.path[4] = 'classes'
    loc.path.length = 5
    loc.query = { _class: target }
    loc.fragment = undefined
    navigate(loc)
  }
</script>

{#if visible}
  <Button
    icon={setting.icon.Setting}
    iconProps={{ size: 'medium' }}
    kind={'icon'}
    dataId={'btnClassSetting'}
    showTooltip={{ label: setting.string.ClassSetting }}
    on:click={openClassSettings}
  />
{/if}
