//
// Copyright © 2020 Anticrm Platform Contributors.
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

import { loadMetadata } from '@hcengineering/platform'
import contact from '@hcengineering/contact'

const icons = require('../assets/icons.svg') as string // eslint-disable-line
// Icons the kit has: the ids stay, stored documents keep pointing at them.
const uiIcons = require('@hcengineering/ui/assets/icons.svg') as string // eslint-disable-line
loadMetadata(contact.icon, {
  ContactApplication: `${uiIcons}#person-circle`,
  Phone: `${icons}#phone`,
  Huly: `${icons}#huly`,
  Email: `${uiIcons}#envelope-fill`,
  EmailLine: `${uiIcons}#envelope`,
  Facebook: `${icons}#facebook`,
  LinkedIn: `${icons}#linkedin`,
  Telegram: `${icons}#telegram`,
  Google: `${icons}#google`,
  Twitter: `${icons}#twitter`,
  Viber: `${icons}#viber`,
  WhatsApp: `${icons}#whatsapp`,
  GitHub: `${icons}#github`,
  Edit: `${uiIcons}#pencil-fill`,
  Person: `${uiIcons}#person-circle`,
  Persona: `${uiIcons}#person`,
  Company: `${uiIcons}#building`,
  SocialEdit: `${uiIcons}#note-pencil`,
  Homepage: `${uiIcons}#globe`,
  Whatsapp: `${icons}#whatsapp`,
  Profile: `${uiIcons}#person-circle`,
  KickUser: `${uiIcons}#person-cross`,
  ComponentMembers: `${icons}#person-squares`,
  Contacts: `${uiIcons}#people`,
  Clock: `${uiIcons}#clock`,
  Chat: `${uiIcons}#bubble-dots`,
  User: `${uiIcons}#person`,
  AddPerson: `${icons}#person-circle-plus`
})

const ProfileBackground = require('../assets/profile-background.png') as string // eslint-disable-line
const ProfileBackgroundLight = require('../assets/profile-background-light.png') as string // eslint-disable-line

loadMetadata(contact.image, {
  ProfileBackground,
  ProfileBackgroundLight
})
