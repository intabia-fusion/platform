<script lang="ts">
  import { concatLink } from '@hcengineering/core'
  import platform, { getMetadata } from '@hcengineering/platform'
  import { type ProviderInfo } from '@hcengineering/account-client'
  import { AnySvelteComponent, Grid, deviceOptionsStore, getCurrentLocation } from '@hcengineering/ui'

  import FormButton from './internal/FormButton.svelte'
  import { Analytics } from '@hcengineering/analytics'
  import { onMount } from 'svelte'
  import login from '../plugin'
  import { getProviders } from '../utils'
  import Github from './providers/Github.svelte'
  import Google from './providers/Google.svelte'
  import OpenId from './providers/OpenId.svelte'

  interface Provider {
    name: string
    component: AnySvelteComponent
    displayName?: string
  }

  const providerMap: Record<string, AnySvelteComponent> = {
    google: Google,
    github: Github,
    openid: OpenId
  }

  let enabledProviders: Provider[] = []

  onMount(() => {
    if (getMetadata(platform.metadata.DevModel) !== true) {
      void getProviders().then((res: ProviderInfo[]) => {
        enabledProviders = res.map((provider) => {
          const component = providerMap[provider.name]
          return {
            ...provider,
            component
          }
        })
      })
    } else {
      enabledProviders = [
        {
          name: 'openid',
          component: OpenId,
          displayName: 'OpenID'
        },
        {
          name: 'github',
          component: Github,
          displayName: 'GitHub'
        }
      ]
    }
  })

  function getColumnsCount (providersCount: number): number {
    if ($deviceOptionsStore.isMobile) {
      return 1
    }
    return providersCount % 2 === 0 ? 2 : 1
  }

  const location = getCurrentLocation()

  function getLink (provider: Provider): string {
    const inviteId = location.query?.inviteId
    const autoJoin = location.query?.autoJoin !== undefined
    const navigateUrl = location.query?.navigateUrl
    const accountsUrl = getMetadata(login.metadata.AccountsUrl) ?? ''
    let path = `/auth/${provider.name}`
    if (inviteId != null) {
      path += `?inviteId=${inviteId}`
      if (autoJoin) {
        path += '&autoJoin'
      }
      if (navigateUrl != null) {
        path += `&navigateUrl=${navigateUrl}`
      }
    }

    return concatLink(accountsUrl, path)
  }

  function handleProviderClick (provider: Provider): void {
    const currentPath = location.path[1]
    const isSignUp = currentPath === 'signup'
    const isJoin = currentPath === 'join'
    const eventPrefix = isSignUp || isJoin ? 'signup' : 'login'
    const eventName: string = `${eventPrefix}.${provider.name}.started`

    Analytics.handleEvent(eventName)
  }
</script>

<div class="container">
<Grid column={getColumnsCount(enabledProviders.length)} columnGap={1} rowGap={1} alignItems={'center'}>
    {#each enabledProviders as provider}
    <a
        class="provider-button"
        href={getLink(provider)}
        on:click={() => {
          handleProviderClick(provider)
        }}
    >
        <FormButton kind={'black'} shape={'round2'} size={'x-large'} width="100%" stopPropagation={false}>
        <svelte:component
            this={provider.component}
            displayName={provider.displayName}
            labelClass={'button-label'}
        />
        </FormButton>
    </a>
    {/each}
</Grid>
</div>

<style lang="scss">
  .container {
    padding-top: 1rem;
  }

  /* Anchor wrapper for provider buttons — keep full-width and remove link styling */
  .container a.provider-button {
    display: block;
    text-decoration: none;
    width: 100%;
  }

  /* Ensure the inner Button stretches to full width inside the anchor wrapper:
     support both the global Button (.antiButton) and the local FormButton (.form-button). */
  .container a.provider-button .antiButton,
  .container a.provider-button .form-button {
    width: 100%;
    display: block;
  }
</style>
