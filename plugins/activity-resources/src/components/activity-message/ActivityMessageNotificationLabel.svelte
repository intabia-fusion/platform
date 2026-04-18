<!--
// Copyright © 2024 Hardcore Engineering Inc.
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
  import { Label, languageStore, tooltip } from '@intabiafusion/ui'
  import { DocNotifyContext } from '@intabiafusion/notification'
  import activity, { ActivityMessage } from '@intabiafusion/activity'
  import { getClient } from '@intabiafusion/presentation'
  import { Doc } from '@intabiafusion/core'
  import { getDocLinkTitle, getDocTitle, ObjectIcon } from '@intabiafusion/view-resources'
  import { getEmbeddedLabel } from '@intabiafusion/platform'
  import contact from '@intabiafusion/contact'

  import ActivityMessagePreview from './ActivityMessagePreview.svelte'

  export let context: DocNotifyContext
  export let object: ActivityMessage

  const client = getClient()
  const hierarchy = client.getHierarchy()

  let title: string | undefined = undefined
  let doc: Doc | undefined = undefined

  $: object &&
    client.findOne(object.attachedToClass, { _id: object.attachedTo, space: object.space }).then((res) => {
      doc = res
    })

  $: doc &&
    getDocLinkTitle(client, doc._id, doc._class, doc, $languageStore).then((res) => {
      title = res
    })
</script>

<span class="flex-presenter flex-gap-1 font-semi-bold">
  <Label label={(object?.replies ?? 0) > 0 ? activity.string.Thread : activity.string.Message} />
  {#if title}
    <span class="lower">
      <Label label={activity.string.In} />
    </span>
    {#if doc}
      {#await getDocTitle(client, doc._id, doc._class, doc) then tooltipLabel}
        <span
          class="flex-presenter flex-gap-0-5"
          use:tooltip={tooltipLabel ? { label: getEmbeddedLabel(tooltipLabel) } : undefined}
        >
          <ObjectIcon value={doc} size={hierarchy.isDerived(doc._class, contact.class.Person) ? 'tiny' : 'small'} />
          {title}
        </span>
      {/await}
    {/if}
  {/if}
</span>
<span class="font-normal">
  <ActivityMessagePreview value={object} {doc} readonly type="content-only" />
</span>
