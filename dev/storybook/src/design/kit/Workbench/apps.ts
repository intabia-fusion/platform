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

import type { AppEntry } from '../types'

// Application rail of the sanity stand in order; `app` ties an entry to the open application
export const railApps: Array<AppEntry & { app?: string }> = [
  { icon: 'notification/notifications', notify: true },
  { icon: 'chunter/chunter', notify: true, app: 'chunter' },
  { icon: 'time/calendar' },
  { icon: 'love/office', divider: true },
  { icon: 'card/card' },
  { icon: 'contact/contactapplication' },
  { icon: 'recruit/recruitment' },
  { icon: 'lead/leadapplication' },
  { icon: 'inventory/inventory' },
  { icon: 'hr/hr' },
  { icon: 'tracker/tracker', app: 'tracker' },
  { icon: 'document/documentapplication' },
  { icon: 'process/process' },
  { icon: 'drive/driveapplication' },
  { icon: 'controlled-documents/documentapplication' },
  { icon: 'training/training-application' },
  { icon: 'products/productsApplication' },
  { icon: 'test-management/testManagementApplication' },
  { icon: 'survey/application' }
]

export const sidebarWidgets: string[] = ['calendar/calendar', 'love/office', 'rating/rating', 'view/ai-star']
