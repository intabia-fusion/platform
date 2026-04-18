<script lang="ts">
  import { getCurrentEmployee } from '@intabiafusion/contact'
  import Documents from './Documents.svelte'

  const currentUser = getCurrentEmployee()
</script>

<Documents query={{ authors: currentUser }} />
