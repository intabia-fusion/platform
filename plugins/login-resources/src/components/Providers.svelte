<script lang="ts">
  import { concatLink } from '@hcengineering/core'
  import platform, { getMetadata } from '@hcengineering/platform'
  import type { ProviderInfo } from '@hcengineering/account-client'
  import type { AnySvelteComponent } from '@hcengineering/ui'
  import { getCurrentLocation } from '@hcengineering/ui'

  import Label from './internal/Label.svelte'
  import { Analytics } from '@hcengineering/analytics'
  import { onMount } from 'svelte'
  import login from '../plugin'
  import { getProviders } from '../utils'
  import Github from './icons/Github.svelte'
  import Google from './icons/Google.svelte'
  import OpenId from './icons/OpenId.svelte'

  export let disabled = false

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

{#if enabledProviders.length > 0}
  <div class="container">
    <Label label={login.string.SignInVia} />
    {#each enabledProviders as provider}
      <a
        class="provider-icon"
        href={disabled ? undefined : getLink(provider)}
        aria-disabled={disabled}
        tabindex={disabled ? -1 : undefined}
        title={provider.displayName ?? provider.name}
        on:click={(event) => {
          if (disabled) event.preventDefault()
          else handleProviderClick(provider)
        }}
      >
        <span aria-hidden="true"><svelte:component this={provider.component} /></span>
        <Label
          className="visually-hidden"
          label={login.string.ContinueWith}
          params={{ provider: provider.displayName ?? provider.name }}
        />
      </a>
    {/each}
  </div>
{/if}

<style lang="scss">
  .container {
    padding-top: 1rem;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-wrap: wrap;
    gap: 0.5rem;
  }

  .provider-icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 44px;
    height: 44px;
    border-radius: 8px;
    color: var(--login-content-color, var(--theme-content-color));
    text-decoration: none;

    &:hover,
    &:focus-visible {
      background: var(--theme-button-hovered);
    }

    &[aria-disabled='true'] {
      opacity: 0.5;
      cursor: not-allowed;
    }
  }

  .provider-icon :global(.visually-hidden) {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border: 0;
  }
</style>
