import { get, writable } from 'svelte/store'
import { ActivityDirection } from './types'

export const activityDirectionStore = writable<ActivityDirection | undefined>(undefined)

const activityDirectionLocalStorageKey = 'activity-direction_v1'

activityDirectionStore.subscribe((position) => {
  if (position != null) {
    localStorage.setItem(activityDirectionLocalStorageKey, position)
  }
})

export function initActivityDirection (): ActivityDirection {
  const current = get(activityDirectionStore)
  if (current != null) return current

  let direction: ActivityDirection
  try {
    const value = localStorage.getItem(activityDirectionLocalStorageKey) ?? ActivityDirection.Forward

    if (value === ActivityDirection.Backward) {
      direction = ActivityDirection.Backward
    } else {
      direction = ActivityDirection.Forward
    }
  } catch (err) {
    direction = ActivityDirection.Forward
  }
  activityDirectionStore.set(direction)
  return direction
}
