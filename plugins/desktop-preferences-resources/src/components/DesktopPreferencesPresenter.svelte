<script lang="ts">
  import { Toggle } from '@hcengineering/ui/kit'
  import core, { Doc, Ref } from '@hcengineering/core'
  import { getClient } from '@hcengineering/presentation'
  import { Grid, Label } from '@hcengineering/ui'

  import type { PreferenceKey } from '@hcengineering/desktop-preferences'
  import desktopPreferences from '@hcengineering/desktop-preferences'

  import { activePreferences } from '../utils'

  $: if (!$activePreferences.showNotifications && $activePreferences.playSound) {
    void doUpdate('playSound', false)
  }

  async function doUpdate (propName: PreferenceKey, value: any): Promise<void> {
    if ('_id' in $activePreferences) {
      await client.update($activePreferences, { [propName]: value })
    } else {
      await client.createDoc(desktopPreferences.class.DesktopNotificationPreference, core.space.Workspace, {
        attachedTo: '',
        ...$activePreferences,
        [propName]: value
      })
    }
  }

  const client = getClient()
  function updater (propName: PreferenceKey) {
    return (e: CustomEvent) => {
      void doUpdate(propName, e.detail)
    }
  }
</script>

<div class="flex-grow vScroll w-full">
  <div class="container">
    <Grid column={2} columnGap={5} rowGap={1.5}>
      <div class="flex">
        <Label label={desktopPreferences.string.ShowNotifications} />
      </div>
      <div class="toggle">
        <Toggle
          size="small"
          tooltip={{ label: desktopPreferences.string.ShowNotifications }}
          checked={$activePreferences.showNotifications}
          on:change={updater('showNotifications')}
        />
      </div>
      <div class="flex" class:disabled={!$activePreferences.showNotifications}>
        <Label label={desktopPreferences.string.PlaySound} />
      </div>
      <div class="toggle">
        <Toggle
          size="small"
          tooltip={{ label: desktopPreferences.string.PlaySound }}
          checked={$activePreferences.playSound}
          disabled={!$activePreferences.showNotifications}
          on:change={updater('playSound')}
        />
      </div>
      <div class="flex">
        <Label label={desktopPreferences.string.BounceAppIcon} />
      </div>
      <div class="toggle">
        <Toggle
          size="small"
          tooltip={{ label: desktopPreferences.string.BounceAppIcon }}
          checked={$activePreferences.bounceAppIcon}
          on:change={updater('bounceAppIcon')}
        />
      </div>
      <div class="flex">
        <Label label={desktopPreferences.string.ShowBadge} />
      </div>
      <div class="toggle">
        <Toggle
          size="small"
          tooltip={{ label: desktopPreferences.string.ShowBadge }}
          checked={$activePreferences.showUnreadCounter}
          on:change={updater('showUnreadCounter')}
        />
      </div>
    </Grid>
  </div>
</div>

<style lang="scss">
  .container {
    width: fit-content;
  }

  .toggle {
    width: fit-content;
  }

  .disabled {
    opacity: 0.8;
  }
</style>
