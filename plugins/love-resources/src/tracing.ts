export async function computeCallTraceParent (meetingId: string, participantId: string): Promise<string | undefined> {
  const subtle = globalThis.crypto?.subtle
  if (subtle == null) return undefined
  const keyBytes = new TextEncoder().encode(`${meetingId}:${participantId}`)
  const digest = await subtle.digest('SHA-1', keyBytes)
  const digestHex = Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
  return `00-${digestHex.slice(0, 32)}-0000000000000001-01`
}
