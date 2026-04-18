<!--
// Copyright © 2025 Hardcore Engineering Inc.
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
  import { MasterTag, Role, Tag } from '@intabiafusion/card'
  import contact from '@intabiafusion/contact'
  import core from '@intabiafusion/core'
  import { createQuery, getClient } from '@intabiafusion/presentation'
  import { clearSettingsStore } from '@intabiafusion/setting-resources'
  import { ButtonIcon, getCurrentResolvedLocation, Icon, IconAdd, Label, navigate, showPopup } from '@intabiafusion/ui'
  import card from '../../plugin'
  import RolesPopup from './RolesPopup.svelte'

  export let masterTag: MasterTag | Tag

  const client = getClient()

  const ancestors = client.getHierarchy().getAncestors(masterTag._id)

  let roles = client.getModel().findAllSync(card.class.Role, { types: { $in: ancestors } })
  const query = createQuery()
  query.query(card.class.Role, { types: { $in: ancestors } }, (res) => {
    roles = res
  })

  function addRole (): void {
    showPopup(
      RolesPopup,
      {
        masterTag,
        roles: roles.map((r) => r._id)
      },
      'top',
      async (res) => {
        if (res !== undefined) {
          const role = res as Role
          if (!role.types.some((type) => ancestors.includes(type))) {
            await client.update(role, {
              $push: { types: masterTag._id }
            })
          }
        }
      }
    )
  }

  const handleSelect = (role: Role): void => {
    const loc = getCurrentResolvedLocation()
    if (role?._id !== undefined) {
      loc.path[5] = card.component.EditRole
      loc.path[6] = role._id
      loc.path.length = 7
    } else {
      loc.path.length = 5
    }

    clearSettingsStore()
    navigate(loc)
  }
</script>

<div class="hulyTableAttr-header font-medium-12">
  <Icon icon={contact.icon.User} size="small" />
  <span><Label label={core.string.Roles} /></span>
  <ButtonIcon kind="primary" icon={IconAdd} size="small" dataId={'btnAdd'} on:click={addRole} />
</div>
<div class="hulyTableAttr-content task">
  {#each roles as role}
    <button
      class="hulyTableAttr-content__row justify-start"
      on:click|stopPropagation={() => {
        handleSelect(role)
      }}
    >
      <div class="hulyTableAttr-content__row-label font-medium-14 cursor-pointer">
        {role.name}
      </div>
    </button>
  {/each}
</div>
