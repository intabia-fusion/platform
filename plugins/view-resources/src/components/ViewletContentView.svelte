<script lang="ts">
  import type { Class, Doc, DocumentQuery, Ref, Space, WithLookup } from '@hcengineering/core'
  import core from '@hcengineering/core'
  import type { IntlString } from '@hcengineering/platform'
  import { createQuery, getClient } from '@hcengineering/presentation'
  import type { AnySvelteComponent, BlankViewProps } from '@hcengineering/ui'
  import { Component, Loading } from '@hcengineering/ui'
  import type { ViewOptions, Viewlet, ViewletPreference } from '@hcengineering/view'
  import view from '@hcengineering/view'

  import { injectCustomAttributes } from '../utils'
  import { injectDescendantAttributes } from '../descendantAttributes'
  import { buildViewletConfigurations } from '../viewletConfigurations'

  export let viewlet: WithLookup<Viewlet>
  export let _class: Ref<Class<Doc>>
  export let query: DocumentQuery<Doc> = {}
  export let space: Ref<Space> | undefined

  export let viewOptions: ViewOptions

  export let createItemDialog: AnySvelteComponent | undefined = undefined
  export let createItemLabel: IntlString | undefined = undefined
  export let createItemEvent: string | undefined = undefined
  export let createItemDialogProps = { shouldSaveDraft: true }
  export let emptyState: BlankViewProps | undefined = undefined
  export let normalizeConfig: ((config: Viewlet['config'], viewlet: Viewlet) => Viewlet['config']) | undefined =
    undefined

  const hierarchy = getClient().getHierarchy()

  const preferenceQuery = createQuery()
  const objectConfigurations = createQuery()
  let preference: ViewletPreference[] = []

  let configurationsLoading = true
  let preferencesLoading = true
  $: loading = configurationsLoading || preferencesLoading

  let configurationRaw: Viewlet[] = []

  function fetchConfigurations (viewlet: Viewlet): void {
    configurationsLoading = objectConfigurations.query(
      view.class.Viewlet,
      {
        attachTo: { $in: hierarchy.getDescendants(_class) },
        descriptor: viewlet.descriptor,
        variant: viewlet.variant ? viewlet.variant : { $exists: false }
      },
      (res) => {
        configurationRaw = res
        configurationsLoading = false
        loading = configurationsLoading || preferencesLoading
      }
    )
  }

  function fetchPreferences (configurationRaw: Viewlet[]): void {
    preferencesLoading = preferenceQuery.query(
      view.class.ViewletPreference,
      {
        space: core.space.Workspace,
        attachedTo: { $in: configurationRaw.map((it) => it._id) }
      },
      (res) => {
        preference = res.map((pref) => {
          const source = configurationRaw.find((item) => item._id === pref.attachedTo)
          return source !== undefined && normalizeConfig !== undefined
            ? { ...pref, config: normalizeConfig(pref.config, source) }
            : pref
        })
        preferencesLoading = false
        loading = configurationsLoading || preferencesLoading
      }
    )
  }

  $: fetchConfigurations(viewlet)
  $: fetchPreferences(configurationRaw)

  $: normalizedConfigurations = configurationRaw.map((source) => ({
    ...source,
    config: normalizeConfig?.(source.config, source) ?? source.config
  }))
  $: configurations = buildViewletConfigurations(viewlet, normalizedConfigurations, preference)

  $: currentPreference = preference.find((it) => it.attachedTo === viewlet._id)
  $: config = injectDescendantAttributes(
    injectCustomAttributes(
      currentPreference?.config ?? normalizeConfig?.(viewlet.config, viewlet) ?? viewlet.config,
      currentPreference?.customAttributes
    ),
    currentPreference?.descendantAttributes
  )
</script>

{#if viewlet?.$lookup?.descriptor?.component}
  {#if loading}
    <Loading />
  {:else}
    <Component
      is={viewlet.$lookup.descriptor.component}
      props={{
        _class,
        config,
        configurations,
        options: viewlet.options,
        createItemDialog,
        createItemDialogProps,
        createItemLabel,
        createItemEvent,
        viewlet,
        viewOptions,
        viewOptionsConfig: viewlet.viewOptions?.other,
        space,
        query,
        ...(emptyState !== undefined ? { emptyState } : {})
      }}
    />
  {/if}
{/if}
