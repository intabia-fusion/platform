//
// Copyright © 2026 Intabia Fusion.
//
// Licensed under the Eclipse Public License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License. You may
// obtain a copy of the License at https://www.eclipse.org/legal/epl-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
//
// See the License for the specific language governing permissions and
// limitations under the License.
//

/**
 * Recording template egress opens when `RECORDING_TEMPLATE_URL` is set. Egress appends `url`, `token`
 * and `layout`, sizes the window from the preset and starts capturing on `START_RECORDING`.
 */
import {
  ConnectionState,
  type Participant,
  type RemoteParticipant,
  type RemoteTrack,
  type RemoteTrackPublication,
  Room,
  RoomEvent,
  Track,
  VideoQuality
} from 'livekit-client'
import {
  computeLayout,
  displayName as formatName,
  initials,
  type ParticipantState,
  type Rect,
  type ScreenState,
  videoQualityFor
} from './layout'

const START_TIMEOUT_MS = 5000
const NO_VIDEO_START_MS = 500
// No attempt starts after 45 s (in practice the last one is at ~30 s), well before love replaces
// the egress with the built-in layout at 60 s.
const CONNECT_GIVE_UP_MS = 45_000
const CONNECT_MAX_DELAY_MS = 15_000

const params = new URLSearchParams(window.location.search)
const url = params.get('url')
const token = params.get('token')

const stage = document.getElementById('stage') as HTMLDivElement

const room = new Room({
  // The recorder needs the full layer whatever the element size.
  adaptiveStream: false,
  dynacast: false
})

const joinedAt = new Map<string, number>()
const lastSpokeAt = new Map<string, number>()
const screenSeenAt = new Map<string, number>()

interface VideoSlot {
  video: HTMLVideoElement
  track?: RemoteTrack
  trackSid?: string
}

interface TileView extends VideoSlot {
  root: HTMLDivElement
  avatar: HTMLDivElement
  name: HTMLDivElement
}

interface ScreenView extends VideoSlot {
  root: HTMLDivElement
}

const tiles = new Map<string, TileView>()
let screenView: ScreenView | undefined

let started = false
function startRecording (): void {
  if (started) return
  started = true
  console.log('START_RECORDING')
}

function place (el: HTMLElement, r: Rect): void {
  el.style.left = `${r.x}px`
  el.style.top = `${r.y}px`
  el.style.width = `${r.w}px`
  el.style.height = `${r.h}px`
}

function displayName (p: Participant): string {
  const name = formatName(p.name ?? '')
  return name !== '' ? name : p.identity
}

// By object, not sid: after a full reconnect the track is a new object under the same sid.
function attachVideo (view: VideoSlot, track: RemoteTrack | undefined): void {
  if (view.track === track) return
  if (view.track !== undefined) view.track.detach(view.video)
  view.video.srcObject = null
  if (track !== undefined) track.attach(view.video)
  view.track = track
  view.trackSid = track?.sid
}

/** Ask the SFU for just what the frame shows; hidden videos are not sent at all. */
function requestVideo (pub: RemoteTrackPublication | undefined, quality: VideoQuality | undefined): void {
  if (pub?.isDesired !== true) return
  pub.setEnabled(quality !== undefined)
  if (quality !== undefined) pub.setVideoQuality(quality)
}

function tileView (p: RemoteParticipant): TileView {
  let view = tiles.get(p.identity)
  if (view === undefined) {
    const root = document.createElement('div')
    root.className = 'tile'
    const video = document.createElement('video')
    video.muted = true
    video.playsInline = true
    video.autoplay = true
    video.addEventListener('resize', scheduleRender)
    const avatar = document.createElement('div')
    avatar.className = 'avatar'
    const name = document.createElement('div')
    name.className = 'name'
    root.append(video, avatar, name)
    stage.appendChild(root)
    view = { root, video, avatar, name }
    tiles.set(p.identity, view)
  }
  return view
}

function ensureScreenView (): ScreenView {
  if (screenView === undefined) {
    const root = document.createElement('div')
    root.className = 'screen'
    const video = document.createElement('video')
    video.muted = true
    video.playsInline = true
    video.autoplay = true
    video.addEventListener('resize', scheduleRender)
    root.appendChild(video)
    stage.prepend(root)
    screenView = { root, video }
  }
  return screenView
}

function collect (): { participants: ParticipantState[], screens: ScreenState[] } {
  const now = Date.now()
  for (const speaker of room.activeSpeakers) lastSpokeAt.set(speaker.identity, now)
  const participants: ParticipantState[] = []
  const screens: ScreenState[] = []
  for (const p of room.remoteParticipants.values()) {
    if (!joinedAt.has(p.identity)) joinedAt.set(p.identity, now)
    const cam = p.getTrackPublication(Track.Source.Camera)
    participants.push({
      id: p.identity,
      name: displayName(p),
      hasCamera: cam?.track !== undefined && !cam.isMuted,
      joinedAt: joinedAt.get(p.identity) ?? now,
      lastSpokeAt: lastSpokeAt.get(p.identity) ?? 0
    })
    const share = p.getTrackPublication(Track.Source.ScreenShare)
    if (share?.track !== undefined && !share.isMuted && share.trackSid !== undefined) {
      if (!screenSeenAt.has(share.trackSid)) screenSeenAt.set(share.trackSid, now)
      const shown = screenView?.trackSid === share.trackSid ? screenView.video : undefined
      screens.push({
        id: share.trackSid,
        participantId: p.identity,
        publishedAt: screenSeenAt.get(share.trackSid) ?? now,
        width: shown !== undefined && shown.videoWidth > 0 ? shown.videoWidth : share.dimensions?.width ?? 0,
        height: shown !== undefined && shown.videoHeight > 0 ? shown.videoHeight : share.dimensions?.height ?? 0
      })
    }
  }
  return { participants, screens }
}

function render (): void {
  const { participants, screens } = collect()
  const layout = computeLayout(participants, screens, window.innerWidth, window.innerHeight)

  // Screen share
  for (const p of room.remoteParticipants.values()) {
    const share = p.getTrackPublication(Track.Source.ScreenShare)
    requestVideo(share, share?.trackSid === layout.screen?.id ? VideoQuality.HIGH : undefined)
  }
  if (layout.screen !== undefined) {
    const view = ensureScreenView()
    const pub = [...room.remoteParticipants.values()]
      .map((p) => p.getTrackPublication(Track.Source.ScreenShare))
      .find((it) => it?.trackSid === layout.screen?.id)
    attachVideo(view, pub?.track as RemoteTrack | undefined)
    place(view.root, layout.screen.rect)
    view.root.style.display = ''
  } else if (screenView !== undefined) {
    attachVideo(screenView, undefined)
    screenView.root.style.display = 'none'
  }

  // Camera tiles
  const tileHeight = new Map(layout.tiles.map((t) => [t.participantId, t.rect.h]))
  for (const p of room.remoteParticipants.values()) {
    const h = tileHeight.get(p.identity)
    requestVideo(p.getTrackPublication(Track.Source.Camera), h !== undefined ? videoQualityFor(h) : undefined)
  }
  for (const [id, view] of tiles) {
    if (!tileHeight.has(id) || room.remoteParticipants.get(id) === undefined) {
      attachVideo(view, undefined)
      view.root.style.display = 'none'
    }
  }
  const speaking = new Set(room.activeSpeakers.map((s) => s.identity))
  for (const t of layout.tiles) {
    const p = room.remoteParticipants.get(t.participantId)
    if (p === undefined) continue
    const view = tileView(p)
    const cam = p.getTrackPublication(Track.Source.Camera)
    const camTrack = cam !== undefined && !cam.isMuted ? (cam.track as RemoteTrack | undefined) : undefined
    attachVideo(view, camTrack)
    view.video.style.display = camTrack !== undefined ? '' : 'none'
    view.avatar.style.display = camTrack !== undefined ? 'none' : ''
    const name = displayName(p)
    if (view.name.textContent !== name) view.name.textContent = name
    const ini = initials(name)
    if (view.avatar.textContent !== ini) view.avatar.textContent = ini
    view.root.classList.toggle('speaking', speaking.has(p.identity))
    view.root.classList.toggle('compact', layout.mode === 'screen')
    view.root.style.fontSize = `${Math.min(24, Math.max(11, Math.round(t.rect.h / 12)))}px`
    place(view.root, t.rect)
    view.root.style.display = ''
  }
}

let renderScheduled = false
function scheduleRender (): void {
  if (renderScheduled) return
  renderScheduled = true
  requestAnimationFrame(() => {
    renderScheduled = false
    render()
  })
}

function onTrackSubscribed (track: RemoteTrack): void {
  if (track.kind === Track.Kind.Audio) {
    // Egress records the page's audio, so every audio track must play.
    const el = track.attach()
    el.style.display = 'none'
    document.body.appendChild(el)
  }
  scheduleRender()
}

function onTrackUnsubscribed (track: RemoteTrack): void {
  if (track.kind === Track.Kind.Audio) {
    for (const el of track.detach()) el.remove()
  }
  scheduleRender()
}

function waitForFirstFrame (connectedAt: number): void {
  const timer = setInterval(() => {
    const elapsed = Date.now() - connectedAt
    const videos = Array.from(document.querySelectorAll('video'))
    const hasFrame = videos.some((v) => v.srcObject !== null && v.videoWidth > 0 && v.readyState >= 2)
    // A camera that is off never sends a frame; waiting for it would cut the first seconds of audio.
    const hasVideoTracks = [...room.remoteParticipants.values()].some((p) =>
      [...p.trackPublications.values()].some((pub) => pub.kind === Track.Kind.Video && pub.isSubscribed && !pub.isMuted)
    )
    if (hasFrame || (!hasVideoTracks && elapsed > NO_VIDEO_START_MS) || elapsed > START_TIMEOUT_MS) {
      clearInterval(timer)
      startRecording()
    }
  }, 100)
}

async function main (): Promise<void> {
  if (url === null || token === null) throw new Error('url and token query parameters are required')
  room
    .on(RoomEvent.ParticipantConnected, scheduleRender)
    .on(RoomEvent.ParticipantDisconnected, scheduleRender)
    .on(RoomEvent.TrackSubscribed, onTrackSubscribed)
    .on(RoomEvent.TrackUnsubscribed, onTrackUnsubscribed)
    .on(RoomEvent.TrackMuted, scheduleRender)
    .on(RoomEvent.TrackUnmuted, scheduleRender)
    .on(RoomEvent.ActiveSpeakersChanged, scheduleRender)
    .on(RoomEvent.ParticipantNameChanged, scheduleRender)
    .on(RoomEvent.Disconnected, () => {
      console.log('END_RECORDING')
    })
  window.addEventListener('resize', scheduleRender)
  const firstAttempt = Date.now()
  for (let delay = 1000; ; delay = Math.min(delay * 2, CONNECT_MAX_DELAY_MS)) {
    try {
      await room.connect(url, token)
      break
    } catch (err) {
      if (Date.now() - firstAttempt + delay > CONNECT_GIVE_UP_MS) throw err
      console.warn('recording template: connect failed, retrying', err)
      await new Promise((resolve) => setTimeout(resolve, delay))
    }
  }
  const connectedAt = Date.now()
  render()
  waitForFirstFrame(connectedAt)
  // Speaker ranking ages even when nobody new speaks, so re-render periodically.
  setInterval(() => {
    if (room.state === ConnectionState.Connected) render()
  }, 1000)
}

main().catch((err) => {
  console.error('recording template failed', err)
  // No START_RECORDING on purpose: a failed recording beats an empty one.
})
