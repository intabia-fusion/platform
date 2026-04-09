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
import { config as dotenvConfig } from 'dotenv'

dotenvConfig()

export interface Config {
  AccountsUrl: string
  AmoCrmDomain: string
  AmoCrmPipelineId: number
  AmoCrmResponsibleUserId: number
  AmoCrmToken: string
  AmoCrmTrialStatus: string
  AmoCrmNotProcessedStatus: string
  Port: number
  QueueConfig: string
  QueueRegion: string
  Secret: string
  ServiceId: string
}

const config: Config = (() => {
  const amoCrmDomain = process.env.AMO_CRM_DOMAIN ?? ''
  const amoCrmPipelineId =
    process.env.AMO_CRM_PIPELINE_ID !== undefined ? parseInt(process.env.AMO_CRM_PIPELINE_ID, 10) : 0
  const amoCrmResponsibleUserId =
    process.env.AMO_CRM_RESPONSIBLE_USER_ID !== undefined ? parseInt(process.env.AMO_CRM_RESPONSIBLE_USER_ID, 10) : 0
  const amoCrmToken = process.env.AMO_CRM_TOKEN ?? ''
  const amoCrmTrialStatus = process.env.AMO_CRM_TRIAL_STATUS ?? 'Подключили триал'
  const amoCrmNotProcessedStatus = process.env.AMO_CRM_NOT_PROCESSED_STATUS ?? 'Не обработали'
  const port = process.env.PORT !== undefined ? parseInt(process.env.PORT, 10) : 3001
  const queueConfig = process.env.QUEUE_CONFIG ?? ''
  const queueRegion = process.env.QUEUE_REGION ?? ''
  const serviceId = process.env.SERVICE_ID ?? 'crm'
  const secret = process.env.SECRET ?? 'secret'

  const params: Config = {
    AccountsUrl: '',
    AmoCrmDomain: amoCrmDomain,
    AmoCrmPipelineId: amoCrmPipelineId,
    AmoCrmResponsibleUserId: amoCrmResponsibleUserId,
    AmoCrmToken: amoCrmToken,
    AmoCrmTrialStatus: amoCrmTrialStatus,
    AmoCrmNotProcessedStatus: amoCrmNotProcessedStatus,
    Port: port,
    QueueConfig: queueConfig,
    QueueRegion: queueRegion,
    Secret: secret,
    ServiceId: serviceId
  }

  // These variables must be set, as without them, the requests go to the default pipline and there is no error
  if (params.AmoCrmPipelineId === 0) {
    throw Error('Missing required config: AmoCrmPipelineId (env: AMO_CRM_PIPELINE_ID)')
  }

  if (params.AmoCrmResponsibleUserId === 0) {
    throw Error('Missing required config: AmoCrmResponsibleUserId (env: AMO_CRM_RESPONSIBLE_USER_ID)')
  }

  return params
})()

export default config
