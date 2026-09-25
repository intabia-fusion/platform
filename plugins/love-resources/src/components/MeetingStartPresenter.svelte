<script lang="ts">
  import { DateRangeMode, type Timestamp } from '@hcengineering/core'
  import { type MeetingMinutes } from '@hcengineering/love'
  import { DatePresenter } from '@hcengineering/view-resources'

  export let object: MeetingMinutes | undefined = undefined
  export let value: Timestamp | undefined = undefined

  $: start =
    object !== undefined
      ? object.startedAt ?? (object.meetingScheduledDate == null ? object.createdOn : undefined)
      : value
</script>

<DatePresenter value={start} mode={DateRangeMode.DATETIME} shouldShowAvatar={false} />
