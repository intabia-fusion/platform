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

import { type StandConfig } from './stand'

// Kubernetes layout of the test stands (deployment/kubernetes/stands/*). The tool
// runs against them in-cluster (K8S_TOOL_IN_POD=1) or from the host through the
// port forwards published by the prepare scripts (K8S_PG_PORT/K8S_KAFKA_PORT/...).
// regionDbs mirrors config.regions[].db of the chart: the europe region of the
// ws/api stands has its own workspace database, the main region uses the stand DB
// (account tables and the main region share it, as they already do on the sanity
// stand).
// Compose parity, deliberate: SERVER_SECRET of every test stand is 'secret' -
// tests/sanity API clients, the backup harness and dev/tool generate tokens with
// the same hardcoded value, so the stand's secrets.platform.serverSecret must
// match (see stands/*/values.yaml).
const serverSecret = 'secret'

interface K8sStandDef {
  host: string
  data: string
  regions: Array<{ id: string, transactorPath: string, collaboratorPath: string, db?: string }>
}

const k8sStands: Record<string, K8sStandDef> = {
  sanity: {
    host: 'sanity.fusion.localhost',
    data: 'sanity',
    regions: [{ id: '', transactorPath: '/_tr0', collaboratorPath: '/_cl0' }]
  },
  ws: {
    host: 'ws.fusion.localhost',
    data: 'wstest',
    regions: [
      { id: '', transactorPath: '/_tr0', collaboratorPath: '/_cl0' },
      { id: 'europe', transactorPath: '/_tr1', collaboratorPath: '/_cl1', db: 'wstesteurope' }
    ]
  },
  api: {
    host: 'api.fusion.localhost',
    data: 'api',
    regions: [
      { id: '', transactorPath: '/_tr0', collaboratorPath: '/_cl0' },
      { id: 'europe', transactorPath: '/_tr1', collaboratorPath: '/_cl1', db: 'apieurope' }
    ]
  },
  // Single-region QMS stand; the workspace dump lives in qms-tests/sanity-ws-qms
  // (dir 'qms-tests' of the stand config, deployment/kubernetes/stands/qms).
  qms: {
    host: 'qms.fusion.localhost',
    data: 'qms',
    regions: [{ id: '', transactorPath: '/_tr0', collaboratorPath: '/_cl0' }]
  }
}

export function k8sStand (cfg: StandConfig): StandConfig {
  const env = { ...cfg.env }
  delete env.REGION_CONFIG

  const name = process.env.K8S_STAND ?? 'sanity'
  const def = k8sStands[name]
  if (def === undefined) {
    throw new Error(`unknown K8s stand '${name}' (expected ${Object.keys(k8sStands).join('|')})`)
  }

  const inPod = process.env.K8S_TOOL_IN_POD === '1'
  const httpsPort = process.env.STAND_HTTPS_PORT ?? '443'
  const host = `${def.host}:${httpsPort}`
  const pgHost = inPod ? 'postgres.platform-base.svc.cluster.local' : 'localhost'
  const pgPort = inPod ? 5432 : Number(process.env.K8S_PG_PORT ?? '65432')
  const kafkaHost = inPod ? 'my-cluster-kafka-bootstrap.platform-base.svc.cluster.local' : 'localhost'
  const kafkaPort = inPod ? 9092 : Number(process.env.K8S_KAFKA_PORT ?? '19092')
  const elasticHost = inPod ? 'elastic.platform-base.svc.cluster.local' : 'localhost'
  const elasticPort = inPod ? 9200 : Number(process.env.K8S_ELASTIC_PORT ?? '19200')
  const platformUrl = `https://${host}`
  const dbUrl = (db: string): string => `postgresql://postgres:postgres@${pgHost}:${pgPort}/${db}?sslmode=disable`

  const regionConfigJson = JSON.stringify({
    regions: Object.fromEntries(
      def.regions.map((r) => [
        r.id,
        {
          transactors: [{ external: `wss://${host}${r.transactorPath}`, internal: `wss://${host}${r.transactorPath}` }],
          collaborators: [
            { external: `wss://${host}${r.collaboratorPath}`, internal: `wss://${host}${r.collaboratorPath}` }
          ]
        }
      ])
    )
  })

  const regionEnv: Record<string, Record<string, string>> = {}
  for (const r of def.regions) {
    if (r.db !== undefined && r.id !== '') {
      regionEnv[r.id] = { ...(cfg.regionEnv?.[r.id] ?? {}), DB_URL: dbUrl(r.db) }
    }
  }

  return {
    ...cfg,
    env: {
      ...env,
      STORAGE_CONFIG: `datalake|${platformUrl}/_datalake`,
      ACCOUNTS_URL: `${platformUrl}/_account`,
      PLATFORM_URL: platformUrl,
      REGION_CONFIG_JSON: regionConfigJson,
      ACCOUNT_DB_URL: dbUrl(def.data),
      DB_URL: dbUrl(def.data),
      SERVER_SECRET: serverSecret,
      QUEUE_CONFIG: `${kafkaHost}:${kafkaPort};-${def.data}`,
      ELASTIC_URL: `http://${elasticHost}:${elasticPort}`
    },
    regionEnv,
    accountsUrl: `${platformUrl}/_account`,
    elasticPort,
    elasticHost,
    waitPorts: [
      [pgHost, pgPort],
      [kafkaHost, kafkaPort],
      [elasticHost, elasticPort],
      [inPod ? def.host : 'localhost', Number(httpsPort)]
    ],
    migrations: []
  }
}
