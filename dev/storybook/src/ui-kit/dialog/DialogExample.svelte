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
  import { getEmbeddedLabel } from '@hcengineering/platform'
  import ui from '@hcengineering/ui'
  import { Button, Dialog, IconButton, Toggle, type DialogProps } from '@hcengineering/ui/kit'

  export let props: Partial<DialogProps> = {}
  export let label: DialogProps['label'] = getEmbeddedLabel('New channel')
  /** Body sample: settings rows, a paragraph, an edge-to-edge list or a list long enough to scroll. */
  export let body: 'form' | 'text' | 'list' | 'long' = 'form'
  export let withTitle: boolean = false
  export let withActions: boolean = false
  export let withFooterStart: boolean = false
  export let withFooterActions: boolean = false
  /** Height of the frame around an embedded dialog. */
  export let frameHeight: string | undefined = undefined

  let isPrivate = true
  let notify = false

  $: rows = body === 'long' ? 24 : 5
  $: embedded = props.embedded === true || $$restProps.embedded === true
</script>

<div class="dialog-example" class:dialog-example--shadow={!embedded} style:height={frameHeight}>
  <Dialog {label} {...props} {...$$restProps} on:submit on:cancel on:close on:fullsize>
    <svelte:fragment slot="title">
      {#if withTitle}<span class="dialog-example__badge">Draft</span>{/if}
    </svelte:fragment>
    <svelte:fragment slot="actions">
      {#if withActions}
        <IconButton
          icon={ui.icon.DotsHorizontal}
          kind="ghost"
          size="small"
          tooltip={{ label: getEmbeddedLabel('More actions') }}
        />
      {/if}
    </svelte:fragment>
    <svelte:fragment slot="footerStart">
      {#if withFooterStart}
        <span class="dialog-example__hint">Members get a notification</span>
      {/if}
    </svelte:fragment>
    <svelte:fragment slot="footerActions">
      {#if withFooterActions}
        <Button kind="ghost" size="medium" icon={ui.icon.InfoCircle} label={getEmbeddedLabel('Preview')} />
      {/if}
    </svelte:fragment>

    {#if body === 'form'}
      <div class="dialog-example__form">
        <Toggle
          label={getEmbeddedLabel('Make private')}
          description={getEmbeddedLabel('Only members can see it')}
          labelPosition="start"
          fullWidth
          bind:checked={isPrivate}
        />
        <Toggle label={getEmbeddedLabel('Notify members')} labelPosition="start" fullWidth bind:checked={notify} />
      </div>
    {:else if body === 'text'}
      <p class="dialog-example__text">
        The channel will be archived: members keep the history, new messages cannot be posted. You can restore it later
        from the archive.
      </p>
    {:else}
      <ul class="dialog-example__list">
        {#each Array.from({ length: rows }, (_, i) => i + 1) as row}
          <li>Member {row}</li>
        {/each}
      </ul>
    {/if}
  </Dialog>
</div>

<style lang="scss">
  .dialog-example {
    display: flex;
    flex-direction: column;

    // Room for the whole shadow: the next row of the story would cover it and leave a hard band.
    &--shadow {
      padding-bottom: calc(var(--global-modal-ShadowY) + var(--global-modal-ShadowBlur));
    }
    &__badge {
      padding: var(--spacing-0_25) var(--spacing-0_75);
      border-radius: var(--extra-small-BorderRadius);
      background-color: var(--global-ui-BackgroundColor);
      font-size: 0.75rem;
      color: var(--global-secondary-TextColor);
    }
    &__hint {
      font-size: 0.8125rem;
      color: var(--global-secondary-TextColor);
    }
    &__form {
      display: flex;
      flex-direction: column;
      gap: var(--spacing-2);
    }
    &__text {
      margin: 0;
      line-height: 1.25rem;
      color: var(--global-primary-TextColor);
    }
    &__list {
      margin: 0;
      padding: 0;
      list-style: none;
      color: var(--global-primary-TextColor);

      li {
        padding: var(--spacing-1) var(--spacing-3);
        border-bottom: 1px solid var(--theme-dialog-border-color);
      }
    }
  }
</style>
