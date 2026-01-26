<script lang="ts">
  import Label from '../internal/Label.svelte'
  import OpenId from '../icons/OpenId.svelte'
  import login from '../../plugin'

  export let displayName = 'OpenId'
  export let labelClass: string | undefined = undefined
</script>

<div class="flex-row-center flex-gap-2">
  <OpenId />
  <Label className={labelClass} label={login.string.ContinueWith} params={{ provider: displayName }} />
</div>
