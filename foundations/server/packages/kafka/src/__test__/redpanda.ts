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

import { RedpandaContainer, type StartedRedpandaContainer } from '@testcontainers/redpanda'

// Same image as the ws-tests stand.
const REDPANDA_IMAGE = 'docker.redpanda.com/redpandadata/redpanda:v24.3.6'

// First run pulls the image.
export const REDPANDA_START_TIMEOUT = 180000

export interface TestBroker {
  container: StartedRedpandaContainer
  brokers: string
}

export async function startRedpanda (opts: { autoCreateTopics: boolean }): Promise<TestBroker> {
  const container = await new RedpandaContainer(REDPANDA_IMAGE).start()
  const res = await container.exec([
    'rpk',
    'cluster',
    'config',
    'set',
    'auto_create_topics_enabled',
    String(opts.autoCreateTopics)
  ])
  if (res.exitCode !== 0) {
    await container.stop()
    throw new Error(`failed to configure redpanda: ${res.output}`)
  }
  return { container, brokers: container.getBootstrapServers() }
}
