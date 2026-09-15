import { createHash } from 'crypto'

export function callTraceParent (meetingId: string, participantId: string): string {
  const digestHex = createHash('sha1').update(`${meetingId}:${participantId}`).digest('hex')
  return `00-${digestHex.slice(0, 32)}-0000000000000001-01`
}

export function participantKeyForEvent (event: {
  event: string
  participant?: { identity?: string }
}): string | undefined {
  if (event.event === 'participant_joined' || event.event === 'participant_left') {
    const identity = event.participant?.identity
    return identity !== undefined && identity !== '' ? identity : undefined
  }
  if (event.event === 'room_started' || event.event === 'room_finished' || event.event.startsWith('egress_')) {
    return 'room'
  }
  return undefined
}
