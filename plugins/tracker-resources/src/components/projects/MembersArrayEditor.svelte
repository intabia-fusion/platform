<script lang="ts">
  import { AccountArrayEditor } from '@intabiafusion/contact-resources'
  import contact from '@intabiafusion/contact-resources/src/plugin'
  import { getClient } from '@intabiafusion/presentation'
  import { Project } from '@intabiafusion/tracker'
  export let value: Project
</script>

<AccountArrayEditor
  label={contact.string.Members}
  value={value.members}
  onChange={(evt) => {
    void getClient().diffUpdate(value, { members: evt })
  }}
/>
