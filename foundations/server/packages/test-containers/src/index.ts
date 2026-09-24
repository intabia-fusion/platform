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

// Services for *.itest.ts, as containers instead of the stand from tests/prepare-tests.sh.
//
// Each getter starts its container on first use and hands every later caller in the same process
// the same address, so a suite that needs postgres and kafka pays for two containers, not for the
// whole stand. An address already in the environment (DB_URL, ELASTIC_URL, QUEUE_CONFIG) is used as
// is - that is how CI keeps running against a prepared stand.

import { join } from 'path'
import { GenericContainer, Wait, type StartedTestContainer } from 'testcontainers'
import { RedpandaContainer, type StartedRedpandaContainer } from '@testcontainers/redpanda'

// Same images the stand uses (tests/docker-compose.yaml); keep them in step.
const POSTGRES_IMAGE = 'postgres:18.1'
const ELASTIC_ICU_IMAGE = 'hcengineering/elasticsearch-icu:8.19.1'
const REDPANDA_IMAGE = 'docker.redpanda.com/redpandadata/redpanda:v24.3.6'
const MINIO_IMAGE = 'quay.io/minio/minio:RELEASE.2025-09-07T16-13-09Z'

const started = new Map<string, Promise<unknown>>()
const running: Array<StartedTestContainer | StartedRedpandaContainer> = []

/** One container per kind per process, and none at all when the address is already in the env. */
async function once<T> (key: string, fromEnv: T | undefined, start: () => Promise<T>): Promise<T> {
  if (fromEnv !== undefined) return fromEnv
  let pending = started.get(key) as Promise<T> | undefined
  if (pending === undefined) {
    pending = start()
    started.set(key, pending)
  }
  return await pending
}

function env (name: string): string | undefined {
  const value = process.env[name]
  return value === undefined || value === '' ? undefined : value
}

/**
 * @public
 */
export async function postgresUrl (): Promise<string> {
  return await once('postgres', env('DB_URL'), async () => {
    const container = await new GenericContainer(POSTGRES_IMAGE)
      .withEnvironment({ POSTGRES_USER: 'postgres', POSTGRES_PASSWORD: 'postgres', POSTGRES_DB: 'postgres' })
      .withExposedPorts(5432)
      // The entrypoint starts the server once to run init scripts and restarts it; only the second
      // line means the port is open.
      .withWaitStrategy(Wait.forLogMessage(/database system is ready to accept connections/, 2))
      .start()
    running.push(container)
    return `postgresql://postgres:postgres@${container.getHost()}:${container.getMappedPort(5432)}/postgres`
  })
}

/**
 * @public
 */
export async function elasticUrl (): Promise<string> {
  return await once('elastic', env('ELASTIC_URL'), async () => {
    const image = await GenericContainer.fromDockerfile(join(__dirname, '..', 'docker', 'elastic')).build(
      ELASTIC_ICU_IMAGE,
      { deleteOnExit: false }
    )
    const container = await image
      .withEnvironment({
        'discovery.type': 'single-node',
        'xpack.security.enabled': 'false',
        'xpack.security.http.ssl.enabled': 'false',
        ES_JAVA_OPTS: '-Xms1024m -Xmx1024m'
      })
      .withExposedPorts(9200)
      .withWaitStrategy(Wait.forHttp('/_cluster/health', 9200).forResponsePredicate((body) => !body.includes('"red"')))
      // A cold JVM plus index bootstrap goes well past the 60s default on a loaded runner.
      .withStartupTimeout(180000)
      .start()
    running.push(container)
    return `http://${container.getHost()}:${container.getMappedPort(9200)}/`
  })
}

/**
 * @public
 */
export async function kafkaBrokers (): Promise<string> {
  return await once('redpanda', env('QUEUE_CONFIG'), async () => {
    const container = await new RedpandaContainer(REDPANDA_IMAGE).start()
    running.push(container)
    return container.getBootstrapServers().replace(/^PLAINTEXT:\/\//, '')
  })
}

/**
 * @public
 */
export interface MinioConfig {
  endPoint: string
  port: number
  accessKey: string
  secretKey: string
  useSSL: string
}

/**
 * @public
 */
export async function minioConfig (): Promise<MinioConfig> {
  const endpoint = env('MINIO_ENDPOINT')
  const fromEnv =
    endpoint === undefined
      ? undefined
      : {
          endPoint: endpoint,
          port: parseInt(env('MINIO_PORT') ?? '9000'),
          accessKey: env('MINIO_ACCESS_KEY') ?? 'minioadmin',
          secretKey: env('MINIO_SECRET_KEY') ?? 'minioadmin',
          useSSL: 'false'
        }
  return await once('minio', fromEnv, async () => {
    const container = await new GenericContainer(MINIO_IMAGE)
      .withCommand(['server', '/data'])
      .withEnvironment({ MINIO_ROOT_USER: 'minioadmin', MINIO_ROOT_PASSWORD: 'minioadmin' })
      .withExposedPorts(9000)
      .withWaitStrategy(Wait.forHttp('/minio/health/live', 9000))
      .start()
    running.push(container)
    return {
      endPoint: container.getHost(),
      port: container.getMappedPort(9000),
      accessKey: 'minioadmin',
      secretKey: 'minioadmin',
      useSSL: 'false'
    }
  })
}

/**
 * Stops whatever this process started. Optional - testcontainers' reaper removes the containers
 * when the process dies anyway - but a jest run that keeps the worker alive holds them until then.
 * @public
 */
export async function stopContainers (): Promise<void> {
  const containers = running.splice(0)
  started.clear()
  await Promise.all(
    containers.map(async (c) => {
      await c.stop()
    })
  )
}
