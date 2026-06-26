<script lang="ts">
  import { Issue } from '@hcengineering/tracker'
  import { Icon, IconClose } from '@hcengineering/ui'
  import { RelatedDocument } from '@hcengineering/core'
  import { getClient } from '@hcengineering/presentation'
  import { removeIssueRelation } from '../../../issues'

  export let object: RelatedDocument
  export let parentIssue: Issue
  export let type: 'blockedBy' | 'relations' | 'isBlocking'

  async function handleClick (): Promise<void> {
    const client = getClient()
    await removeIssueRelation(client, parentIssue, object, type)
  }
</script>

<button class="btn-remove-relation" on:click|stopPropagation={handleClick} title="Удалить связь">
  <Icon icon={IconClose} size="x-small" />
</button>

<style>
  .btn-remove-relation {
    flex-shrink: 0;
    margin-left: 0.125rem;
    padding: 0 0.25rem 0 0.125rem;
    height: 1.75rem;
    color: var(--theme-content-color);
    border-left: 1px solid transparent;
  }
  .btn-remove-relation:hover {
    color: var(--theme-caption-color);
    border-left-color: var(--theme-divider-color);
  }
</style>
