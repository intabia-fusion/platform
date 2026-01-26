<script lang="ts">
  import Label from '../internal/Label.svelte'
  import Google from '../icons/Google.svelte'
  import login from '../../plugin'

  export let displayName = 'Google'
  export let labelClass: string | undefined = undefined
</script>

<div class="flex-row-center flex-gap-2">
  <Google />
  <Label className={labelClass} label={login.string.ContinueWith} params={{ provider: displayName }} />
</div>
