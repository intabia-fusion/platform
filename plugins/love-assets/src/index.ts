//
// Copyright © 2023 Hardcore Engineering Inc.
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

import { loadMetadata } from '@hcengineering/platform'
import love from '@hcengineering/love'

// Icons the kit has: the ids stay, stored documents keep pointing at them.
const uiIcons = require('@hcengineering/ui/assets/icons.svg') as string // eslint-disable-line
loadMetadata(love.icon, {
  Love: `${uiIcons}#building`,
  SharingEnabled: `${uiIcons}#screen-share-stop`,
  SharingDisabled: `${uiIcons}#screen-share`,
  CamEnabled: `${uiIcons}#camera`,
  CamDisabled: `${uiIcons}#camera-off`,
  Cam: `${uiIcons}#camera`,
  Mic: `${uiIcons}#mic`,
  MicEnabled: `${uiIcons}#mic`,
  MicDisabled: `${uiIcons}#mic-off`,
  LeaveRoom: `${uiIcons}#arrow-out`,
  EnterRoom: `${uiIcons}#arrow-in`,
  Open: `${uiIcons}#door-open`,
  DND: `${uiIcons}#door-slash`,
  Record: `${uiIcons}#circle-dot`,
  FullScreen: `${uiIcons}#arrows-out`,
  ExitFullScreen: `${uiIcons}#arrows-in-corners`,
  Invite: `${uiIcons}#phone-plus`,
  Kick: `${uiIcons}#person-cross`,
  MeetingMinutes: `${uiIcons}#notepad-pencil`
})
loadMetadata(love.sound, {
  Knock: require('../assets/knock.wav'),
  MeetingEndNotification: require('../assets/meeting-end-notification.wav')
})
