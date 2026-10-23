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

import { Kafka, logLevel } from 'kafkajs'

export interface Letter {
  to?: string
  subject: string
  text: string
  html: string
}

export interface Mailbox {
  /** Letters to `to` (text containing `part`, if given) seen since the mailbox was opened. */
  letters: (to: string, part?: string) => Letter[]
  /** Waits for the first such letter; throws on timeout. */
  waitFor: (to: string, part?: string, timeoutMs?: number) => Promise<Letter>
  close: () => Promise<void>
}

// Stands deliver no mail: account publishes letters to the notification topic, read here.
// Sanity redpanda listens on 19093, the dev stand on 19092; the topic may carry a postfix.
const broker = process.env.MAILBOX_KAFKA_BROKER ?? 'localhost:19093'
const topic = process.env.MAILBOX_TOPIC ?? '^notifications(-.*)?$'

/** Starts reading at the end of the topic, so open it before the action that sends the letter. */
export async function openMailbox (): Promise<Mailbox> {
  const kafka = new Kafka({ clientId: 'sanity-mailbox', brokers: [broker], logLevel: logLevel.NOTHING })
  const consumer = kafka.consumer({ groupId: `sanity-mailbox-${Date.now()}-${Math.random()}` })
  const seen: Letter[] = []

  await consumer.connect()
  await consumer.subscribe({ topics: [topic.startsWith('^') ? new RegExp(topic) : topic], fromBeginning: false })
  // Latest offsets are fixed at the group join; a letter sent before it would be missed.
  const joined = new Promise<void>((resolve) =>
    consumer.on(consumer.events.GROUP_JOIN, () => {
      resolve()
    })
  )
  await consumer.run({
    eachMessage: async ({ message }) => {
      if (message.value == null) return
      const parsed = JSON.parse(message.value.toString())
      if (parsed?.type === 'email' && parsed.data != null) seen.push(parsed.data as Letter)
    }
  })

  await joined

  const letters = (to: string, part?: string): Letter[] =>
    seen.filter((l) => l.to === to && (part === undefined || l.text.includes(part)))

  return {
    letters,
    waitFor: async (to, part, timeoutMs = 30000) => {
      const end = Date.now() + timeoutMs
      while (Date.now() < end) {
        const found = letters(to, part)
        if (found.length > 0) return found[0]
        await new Promise((resolve) => setTimeout(resolve, 200))
      }
      throw new Error(`No letter to ${to} in topic ${topic} at ${broker} within ${timeoutMs}ms`)
    },
    close: async () => {
      await consumer.disconnect()
    }
  }
}
