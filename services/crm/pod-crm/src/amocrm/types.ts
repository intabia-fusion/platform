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

export interface AmoCrmStatusesResponse {
  _embedded: {
    statuses: Array<{
      id: number
      name: string
    }>
  }
}

export interface AmoCrmCustomFieldsResponse {
  _embedded: {
    custom_fields: Array<{
      id: number
      name: string
    }>
  }
}

export interface AmoCrmContactCustomFieldValue {
  field_code: 'EMAIL' | 'PHONE'
  values: Array<{
    value: string
    enum_code: 'WORK'
  }>
}

export interface AmoCrmContact {
  first_name: string
  last_name?: string
  custom_fields_values?: AmoCrmContactCustomFieldValue[]
}

export interface AmoCrmLeadCustomFieldValue {
  field_id: number
  values: Array<{
    value: string
  }>
}

export interface AmoCrmLeadRequest {
  status_id?: number
  pipeline_id: number
  responsible_user_id: number
  _embedded: {
    contacts: AmoCrmContact[]
  }
  custom_fields_values?: AmoCrmLeadCustomFieldValue[]
}

export interface AmoCrmLeadResponse {
  id: number
  contact_id: number
  request_id: string[]
}

export interface AmoCrmNoteRequest {
  entity_id: number
  note_type: 'common'
  params: {
    text: string
  }
}
