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

import { type MeasureContext } from '@hcengineering/core'

import config from '../config'
import {
  type AmoCrmStatusesResponse,
  type AmoCrmCustomFieldsResponse,
  type AmoCrmLeadRequest,
  type AmoCrmLeadResponse,
  type AmoCrmContactCustomFieldValue,
  type AmoCrmLeadCustomFieldValue,
  type AmoCrmNoteRequest
} from './types'

export class AmoCrmClient {
  private readonly ctx: MeasureContext

  constructor (ctx: MeasureContext) {
    this.ctx = ctx
  }

  async createLead (
    cookieValues: Record<string, string>,
    status: string,
    firstName: string,
    lastName?: string,
    email?: string,
    phone?: string,
    comment?: string
  ): Promise<void> {
    if (email === undefined && phone === undefined) {
      this.ctx.error('AmoCRM lead requires email or phone', { firstName, lastName })
      return
    }

    const customFields = await this.fetchCustomFields()

    const leadCustomFields: AmoCrmLeadCustomFieldValue[] = []
    for (const [name, value] of Object.entries(cookieValues)) {
      // Yandex Metric start with _ym, need delete first symbol for AmoCRM
      const id = customFields.get(name.startsWith('_') ? name.substring(1) : name)
      if (id !== undefined) {
        leadCustomFields.push({
          field_id: id,
          values: [
            {
              value
            }
          ]
        })
      }
    }

    const contactCustomFields: AmoCrmContactCustomFieldValue[] = []
    if (email !== undefined) {
      contactCustomFields.push({
        field_code: 'EMAIL',
        values: [
          {
            value: email,
            enum_code: 'WORK'
          }
        ]
      })
    }
    if (phone !== undefined) {
      contactCustomFields.push({
        field_code: 'PHONE',
        values: [
          {
            value: phone,
            enum_code: 'WORK'
          }
        ]
      })
    }

    const statuses = await this.fetchStatuses()
    const statusId = statuses.get(status)
    if (statusId === undefined) {
      this.ctx.error('AmoCRM status not found', { status })
    }

    const lead: AmoCrmLeadRequest = {
      // if the status is not passed, the lead is sent to the very first pipline status, so as not to lose the lead
      ...(statusId !== undefined && { status_id: statusId }),
      pipeline_id: config.AmoCrmPipelineId,
      responsible_user_id: config.AmoCrmResponsibleUserId,
      _embedded: {
        contacts: [
          {
            first_name: firstName,
            ...(lastName !== undefined && { last_name: lastName }),
            ...(contactCustomFields.length > 0 && { custom_fields_values: contactCustomFields })
          }
        ]
      },
      ...(leadCustomFields.length > 0 && { custom_fields_values: leadCustomFields })
    }

    const response = await this.post<AmoCrmLeadRequest[], AmoCrmLeadResponse[]>(
      '/api/v4/leads/complex',
      'AmoCRM lead',
      [lead]
    )

    this.ctx.info('AmoCRM lead created', { response: JSON.stringify(response) })

    if (comment !== undefined) {
      const entityId = response[0].id
      await this.createNote(entityId, comment)
    }
  }

  private async createNote (entityId: number, text: string): Promise<void> {
    const note: AmoCrmNoteRequest = {
      entity_id: entityId,
      note_type: 'common',
      params: {
        text
      }
    }

    await this.post<AmoCrmNoteRequest[], unknown>(`/api/v4/leads/${entityId}/notes`, 'AmoCRM note', [note])

    this.ctx.info('AmoCRM note created', { entityId, text })
  }

  private async fetchStatuses (): Promise<Map<string, number>> {
    return await this.fetchMap(
      `/api/v4/leads/pipelines/${config.AmoCrmPipelineId}/statuses`,
      'AmoCRM statuses',
      (d: AmoCrmStatusesResponse) => d._embedded.statuses
    )
  }

  private async fetchCustomFields (): Promise<Map<string, number>> {
    return await this.fetchMap(
      '/api/v4/leads/custom_fields?filter[type][0]=text',
      'AmoCRM custom fields',
      (d: AmoCrmCustomFieldsResponse) => d._embedded.custom_fields
    )
  }

  private async get<T>(path: string, label: string): Promise<T> {
    const response = await fetch(`${config.AmoCrmDomain}${path}`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${config.AmoCrmToken}`,
        'Content-Type': 'application/json'
      }
    })

    if (!response.ok) {
      this.ctx.error(`Failed to fetch ${label}`, {
        status: response.status,
        statusText: response.statusText,
        body: await response.text()
      })
      throw new Error(`HTTP error: ${response.status}`)
    }

    return (await response.json()) as T
  }

  private async post<TReq, TRes>(path: string, label: string, body: TReq): Promise<TRes> {
    const response = await fetch(`${config.AmoCrmDomain}${path}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.AmoCrmToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    })

    if (!response.ok) {
      this.ctx.error(`Failed to post ${label}`, {
        status: response.status,
        statusText: response.statusText,
        body: await response.text(),
        request: JSON.stringify(body)
      })
      throw new Error(`HTTP error: ${response.status}`)
    }

    return (await response.json()) as TRes
  }

  private async fetchMap<T>(
    path: string,
    label: string,
    extractItems: (data: T) => Array<{
      name: string
      id: number
    }>
  ): Promise<Map<string, number>> {
    const data = await this.get<T>(path, label)

    const result = new Map<string, number>()
    extractItems(data).forEach((item) => result.set(item.name, item.id))

    this.ctx.info(`${label} fetched`, { available: Array.from(result.keys()).join(', ') })

    return result
  }
}
