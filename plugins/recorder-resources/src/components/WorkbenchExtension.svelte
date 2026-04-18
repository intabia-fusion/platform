<script lang="ts">
  import { getMetadata } from '@intabiafusion/platform'
  import { pushRootBarComponent } from '@intabiafusion/ui'
  import { onMount } from 'svelte'

  import recorder from '../plugin'
  import { AccountRole, getCurrentAccount, hasAccountRole } from '@intabiafusion/core'

  const readonly = !hasAccountRole(getCurrentAccount(), AccountRole.Guest)

  onMount(() => {
    const endpoint = getMetadata(recorder.metadata.StreamUrl) ?? ''
    if (endpoint !== '' && !readonly) {
      pushRootBarComponent('right', recorder.component.RecorderExt, 1300)
    }
  })
</script>

<div id="recorder-workbench-ext" class="hidden" />
