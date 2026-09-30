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

// API-level test, no browser: the "Summarize" action is a POST /summarize with the user's token.

import { expect, test } from '@playwright/test'
import { getClient as getAccountClient } from '@hcengineering/account-client'
import { getWorkspaceToken, loadServerConfig } from '@hcengineering/api-client'
import { type Class, type Doc, generateId, type Ref, type Space, systemAccountUuid } from '@hcengineering/core'
import { generateToken } from '@hcengineering/server-token'
import love, { MeetingStatus, RecordingState, TranscriptionState, type MeetingMinutes } from '@hcengineering/love'
import { PlatformURI, PlatformUserThird } from '../utils'
import { getMeetingsUser, getPlatformToken, getSystemRestClient } from './meeting-helpers'

const MEETINGS_WS = 'meetings-ws'
const CHAT_MESSAGE = 'chunter:class:ChatMessage' as Ref<Class<Doc>>
const AI_BOT_EMAIL_KEY = 'email:huly.ai.bot@hc.engineering'

const baseUrl = (): string => (PlatformURI ?? 'http://localhost:8083').replace(/\/$/, '')

async function getThirdUserToken (): Promise<string> {
  const token = await getWorkspaceToken(
    baseUrl(),
    { email: PlatformUserThird, password: '1234', workspace: MEETINGS_WS },
    await loadServerConfig(baseUrl())
  )
  return token.token
}

async function summarize (token: string, meetingId: Ref<MeetingMinutes>): Promise<number> {
  const res = await fetch(`${baseUrl()}/_aibot/summarize`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ target: meetingId, targetClass: love.class.MeetingMinutes, lang: 'en' })
  })
  return res.status
}

export function registerPrivateSummaryTests (): void {
  test.describe('meeting minutes - summary of a private meeting', () => {
    // FUSIO-788: the bot is not a member of a private meeting, so the summary used to be skipped.
    test('member gets a summary written by the AI bot, non-member is refused', async () => {
      const sys = await getSystemRestClient()
      const { client: member, account } = await getMeetingsUser()

      const meetingId = generateId<MeetingMinutes>()
      try {
        await sys.createDoc(
          love.class.MeetingMinutes,
          meetingId as unknown as Ref<Space>,
          {
            name: 'FUSIO-788 private summary',
            description: '',
            private: true,
            archived: false,
            members: [account],
            owners: [account],
            descriptionRef: null,
            summary: null,
            status: MeetingStatus.Finished,
            meetingEnd: Date.now() - 60_000,
            transcriptionState: TranscriptionState.NotStarted,
            recordingState: RecordingState.NotStarted,
            language: 'en'
          },
          meetingId
        )
        await member.addCollection(
          CHAT_MESSAGE,
          meetingId as unknown as Ref<Space>,
          meetingId,
          love.class.MeetingMinutes,
          'transcription',
          { message: '<p>We ship the release on Friday</p>' } as any
        )

        expect(await summarize(await getThirdUserToken(), meetingId)).toBe(404)
        expect(await summarize(await getPlatformToken(), meetingId)).toBe(202)

        let meeting: MeetingMinutes | undefined
        await expect
          .poll(
            async () => {
              meeting = await member.findOne(love.class.MeetingMinutes, { _id: meetingId })
              return meeting?.summary ?? null
            },
            { timeout: 60_000, intervals: [1000] }
          )
          .not.toBeNull()

        // Resolved through the account: a stand workspace restored from backup may hold another bot Person.
        const accounts = getAccountClient(
          `${baseUrl()}/_account`,
          generateToken(systemAccountUuid, undefined, { service: 'tool' }, 'secret')
        )
        const botUuid = await accounts.findPersonBySocialKey(AI_BOT_EMAIL_KEY)
        expect(botUuid).toBeDefined()
        expect(meeting?.modifiedBy).toBe(await accounts.findSocialIdBySocialKey(`huly:${botUuid}`))
      } finally {
        await sys
          .removeDoc(love.class.MeetingMinutes, meetingId as unknown as Ref<Space>, meetingId)
          .catch(() => undefined)
      }
    })
  })
}
