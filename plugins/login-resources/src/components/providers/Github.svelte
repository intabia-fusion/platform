<script lang="ts">
  import Label from '../internal/Label.svelte'
  import Github from '../icons/Github.svelte'
  import login from '../../plugin'

  export let displayName = 'Github'
  export let labelClass: string | undefined = undefined
</script>

<div class="flex-row-center flex-gap-2">
  <Github />
  <Label className={labelClass} label={login.string.ContinueWith} params={{ provider: displayName }} />
</div>
