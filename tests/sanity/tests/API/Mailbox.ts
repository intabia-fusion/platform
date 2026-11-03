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

import { Kafka, logLevel, type ISocketFactoryArgs } from 'kafkajs'
import net from 'net'

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
// Compose redpanda listens on 19093, the dev stand on 19092; the topic may carry a
// region prefix and a stand postfix (k8s stands: pg.notifications-sanity).
const broker = process.env.MAILBOX_KAFKA_BROKER ?? 'localhost:19093'
const topic = process.env.MAILBOX_TOPIC ?? '^(?:[a-z0-9-]+\\.)?notifications(-.*)?$'

// The k8s stand's Kafka advertises in-cluster pod DNS (my-cluster-combined-0.
// my-cluster-kafka-brokers...:9092) that the host cannot resolve, and with-stand-env.sh
// reaches it through a port-forward; pin every connection to the configured
// loopback broker regardless of the advertised address.
const brokerUrl = new URL(`tcp://${broker}`)
const loopbackBroker = brokerUrl.hostname === 'localhost' || brokerUrl.hostname === '127.0.0.1'
const socketFactory = loopbackBroker
  ? ({ onConnect }: ISocketFactoryArgs) => {
    const socket = new net.Socket()
    socket.connect({ host: brokerUrl.hostname, port: Number(brokerUrl.port) }, onConnect)
    return socket
  }
  : undefined

/** Starts reading at the end of the topic, so open it before the action that sends the letter. */
export async function openMailbox (): Promise<Mailbox> {
  const kafka = new Kafka({ clientId: 'sanity-mailbox', brokers: [broker], logLevel: logLevel.NOTHING, socketFactory })
  const consumer = kafka.consumer({ groupId: `sanity-mailbox-${Date.now()}-${Math.random()}` })
  const seen: Letter[] = []

  try {
    await consumer.connect()
  } catch (err) {
    throw new Error(`Mailbox cannot reach Kafka at ${broker}: ${(err as Error).message}`)
  }
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
