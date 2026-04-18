<!--
  Copyright @ 2024 Hardcore Engineering Inc.
-->

<script lang="ts">
  import type { Training } from '@intabiafusion/training'
  import { getClient } from '@intabiafusion/presentation'
  import { Label } from '@intabiafusion/ui'

  export let value: Training

  const label = getClient().getHierarchy().getAttribute(value._class, 'revision').label
</script>

<span>
  <Label {label} />
  {value.revision}
</span>
