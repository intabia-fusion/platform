import {
  MeasureContext,
  readOnlyGuestAccountUuid,
  Ref,
  systemAccountUuid,
  type WorkspaceUuid,
  concatLink
} from '@hcengineering/core'
import { MeetingMinutes, MeetingStatus, ParticipantMetadata, RoomMetadata } from '@hcengineering/love'
import { RoomAgentDispatch, RoomServiceClient } from 'livekit-server-sdk'
import { WorkspaceClient } from './workspaceClient'
import { isWorkspaceLoginInfo, WorkspaceLoginInfo } from '@hcengineering/account-client'
import { decodeToken, generateToken, Token } from '@hcengineering/server-token'
import config from './config'
import { Request, Response } from 'express'
import { createToken, decodeMeetingToken, extractToken, getRoomName } from './utils'
import { getAccountClient } from '@hcengineering/server-client'
import { combineName } from '@hcengineering/contact'
import { createHash, createHmac } from 'crypto'

// Guest links go to anyone. A key derived from the LiveKit secret never equals SECRET,
// so a link is no platform token even when both secrets are configured the same.
const guestTokenSecret = createHmac('sha256', config.ApiSecret).update('love-guest-token').digest('hex')

function deriveGuestPersonToken (meetingId: string, firstName: string, lastName: string): string {
  const name = `${firstName.trim().toLowerCase()}:${lastName.trim().toLowerCase()}`
  const hash = createHash('sha256').update(`${meetingId}:${name}`).digest('hex').slice(0, 32)
  return `guest-link:${hash}`
}

function decodeGuestToken (token: string): Token {
  try {
    return decodeToken(token, true, guestTokenSecret)
  } catch {
    // Legacy links signed with the raw LiveKit secret carry no exp: drop this once they are retired.
    return decodeToken(token, true, config.ApiSecret)
  }
}

export class GuestManager {
  constructor (
    readonly ctx: MeasureContext,
    readonly roomClient: RoomServiceClient
  ) {}

  private async createShortLink (guestToken: string, workspaceId: string): Promise<string | null> {
    try {
      const sysToken = generateToken(systemAccountUuid, workspaceId as WorkspaceUuid, { service: 'love' })
      const res = await fetch(concatLink(config.AccountsURL, '/api/v1/createShortLink'), {
        method: 'POST',
        headers: {
          Authorization: 'Bearer ' + sysToken,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ payload: guestToken, workspaceId })
      })

      if (!res.ok) {
        this.ctx.error('[createShortLink] account-service returned error', { status: res.status })
        return null
      }

      const data = await res.json()
      return data?.shortId ?? null
    } catch (err: any) {
      this.ctx.error('[createShortLink] failed', { err })
      return null
    }
  }

  async handleGuestToken (req: Request, res: Response): Promise<void> {
    const { meetingId, workspaceId } = decodeMeetingToken(req, res)
    if (meetingId == null || workspaceId == null) {
      return
    }

    try {
      // We also need workspace info to generate guest token with proper workspace claims, so validate token and workspace access first
      const token = extractToken(req.headers)
      const wsLoginInfo = await getAccountClient(token).getLoginInfoByToken()
      if (!isWorkspaceLoginInfo(wsLoginInfo)) {
        res.status(401).send()
        return
      }
      res.status(200).send({
        token: await this.createGuestToken(meetingId, wsLoginInfo)
      })
    } catch (e) {
      console.error(e)
      res.status(500).send()
    }
  }

  async createGuestToken (meetingId: Ref<MeetingMinutes>, wsLoginInfo: WorkspaceLoginInfo): Promise<string> {
    const wsClient = await WorkspaceClient.create(wsLoginInfo.workspace, this.ctx)
    const meetingDoc = await wsClient.findMeetingById(meetingId)
    if (meetingDoc === undefined) {
      throw new Error('Meeting not found')
    }

    const workspaceUrl = wsLoginInfo.workspaceUrl ?? ''
    const guestToken = generateToken(
      readOnlyGuestAccountUuid,
      wsLoginInfo.workspace,
      { meetingId, workspaceUrl, guest: 'true' },
      guestTokenSecret
    )

    const shortId = await this.createShortLink(guestToken, wsLoginInfo.workspace)
    if (shortId === null) {
      this.ctx.error('[createGuestToken] failed to create short link, falling back to raw token', { meetingId })
      return guestToken
    }

    return shortId
  }

  async handleGuestInfo (req: Request, res: Response): Promise<void> {
    const guestToken = req.body.token

    if (typeof guestToken !== 'string') {
      res.status(400).send()
      return
    }

    try {
      let decoded: Token
      try {
        decoded = decodeGuestToken(guestToken)
      } catch (err) {
        res.status(401).send({ error: 'Invalid or expired token' })
        return
      }

      const meetingId: Ref<MeetingMinutes> = decoded.extra?.meetingId
      const workspace = decoded.workspace
      const workspaceUrl = decoded.extra?.workspaceUrl ?? null

      if (typeof meetingId !== 'string' || typeof workspace !== 'string') {
        res.status(400).send({ error: 'Invalid token payload' })
        return
      }

      // Resolve meeting & room presence via workspace client and livekit room list
      const wsClient = await WorkspaceClient.create(workspace, this.ctx)
      const meetingDoc = await wsClient.findMeetingById(meetingId)
      if (meetingDoc === undefined) {
        res.status(404).send({ error: 'Meeting not found' })
        return
      }
      const meetingStatus = meetingDoc.status
      const roomName = getRoomName(workspace, meetingId)
      let roomFound = false
      try {
        const rooms = await this.roomClient.listRooms([roomName])
        roomFound = !(rooms === undefined || rooms.length === 0)
      } catch (e) {
        this.ctx.warn('[guestInfo] Failed to check LiveKit room, assuming not found', { roomName })
        roomFound = false
      }

      res.status(200).send({
        meetingId,
        workspace,
        workspaceUrl,
        now: Date.now(),
        meetingScheduledDate: meetingDoc.meetingScheduledDate,
        meetingEnd: meetingDoc.meetingEnd,
        title: meetingDoc.name,
        meetingStatus,
        roomFound,
        canStart: meetingDoc.status === MeetingStatus.Active || meetingDoc.startOnLink === true
      })
    } catch (e) {
      console.error(e)
      res.status(500).send()
    }
  }

  async handleGuestJoin (req: Request, res: Response): Promise<void> {
    const guestToken = req.body.token
    const firstName = req.body.firstName
    const lastName = req.body.lastName
    const personToken = req.body.personToken

    if (typeof guestToken !== 'string') {
      res.status(400).send()
      return
    }

    if (
      typeof firstName !== 'string' ||
      firstName.trim() === '' ||
      typeof lastName !== 'string' ||
      lastName.trim() === ''
    ) {
      res.status(400).send({ error: 'Please enter your first and last name' })
      return
    }

    try {
      // Validate guest token and extract meeting + workspace
      let decoded: Token
      try {
        decoded = decodeGuestToken(guestToken)
      } catch (err) {
        res.status(401).send({ error: 'Invalid or expired token' })
        return
      }

      const meetingId: Ref<MeetingMinutes> = decoded.extra?.meetingId
      const workspace = decoded.workspace

      if (typeof meetingId !== 'string' || typeof workspace !== 'string') {
        res.status(400).send({ error: 'Invalid token payload' })
        return
      }

      const guestPersonToken =
        typeof personToken === 'string' && personToken.trim() !== ''
          ? personToken
          : deriveGuestPersonToken(meetingId, firstName, lastName)
      if (guestPersonToken !== personToken) {
        this.ctx.warn('[guestJoin] No personToken from client, derived one from the link', { meetingId, guestPersonToken })
      }

      // Resolve or create a Person for this guest (so webhook and ui can reliably reference a Person)
      const wsClient = await WorkspaceClient.create(workspace, this.ctx)

      const meetingDoc = await wsClient.findMeetingById(meetingId)
      if (meetingDoc === undefined) {
        res.status(404).send({ error: 'Meeting not found' })
        return
      }

      const roomName = getRoomName(workspace, meetingId)

      if (meetingDoc.status === MeetingStatus.Scheduled || meetingDoc.status === MeetingStatus.Finished) {
        if (meetingDoc.startOnLink !== true) {
          res.status(403).send({
            error:
              meetingDoc.status === MeetingStatus.Finished
                ? 'Meeting has already finished.'
                : 'Meeting has not started yet.'
          })
          return
        }
        const started = await wsClient.restartMeeting(meetingId)
        if (!started) {
          res.status(500).send({ error: 'Failed to start the meeting' })
          return
        }
      }

      const room = await this.roomClient.listRooms([roomName])
      if (room === undefined || room.length === 0) {
        this.ctx.info('No room found, creating room for the guest link', { roomName })
        try {
          await this.roomClient.createRoom({
            metadata: JSON.stringify({ workspaceId: workspace as WorkspaceUuid, meetingId } satisfies RoomMetadata),
            departureTimeout: config.DepartureTimeoutSec,
            name: roomName,
            agents: config.Agents.map((it) => new RoomAgentDispatch({ agentName: it }))
          })
        } catch (err: any) {
          this.ctx.error('[guestJoin] Failed to create room', { roomName, error: err?.message ?? String(err) })
          res.status(500).send({ error: 'Failed to start the meeting' })
          return
        }
      }
      // Try finding an existing person by name to avoid duplicates
      const personRef = await wsClient.ensurePersonByName(guestPersonToken, firstName, lastName)

      if (personRef === undefined) {
        // Repeated failures while creating a Person - do not fallback to ephemeral identity.
        this.ctx.error('[guestJoin] Failed to create Person for guest join after retries', { firstName, lastName })
        res.status(500).send({ error: 'Failed to create guest identity' })
        return
      }

      // Use the person's document id as LiveKit identity so webhooks can resolve the person
      this.ctx.info('[guestJoin] Using identity', { identity: personRef })
      // Mark this participant as a guest in the token metadata
      const guestMetadata = JSON.stringify({ isGuest: true } satisfies ParticipantMetadata)
      const roomToken = await createToken(roomName, personRef, combineName(firstName, lastName), guestMetadata)

      res.status(200).send({
        token: roomToken,
        roomName,
        person: personRef
      })
    } catch (e) {
      console.error(e)
      res.status(500).send()
    }
  }
}
