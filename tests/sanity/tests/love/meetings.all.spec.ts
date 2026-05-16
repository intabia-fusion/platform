//
// Copyright © 2026 Intabia Fusion.
//
// Licensed under the Eclipse Public License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License. You may
// obtain a copy of the License at https://www.eclipse.org/legal/epl-2.0
//

import { test } from '@playwright/test'

import { registerAccessTests } from './meetings.access.tests'
import { registerBidirectionalLoopTests } from './meetings.bidirectional-loop.tests'
import { registerConnectTests } from './meetings.connect.tests'
import { registerGuestTests } from './meetings.guest.tests'
import { registerInviteTests } from './meetings.invite.tests'
import { registerInviteUiTests } from './meetings.invite-ui.tests'
import { registerKnockOfficeTests } from './meetings.knock-office.tests'
import { registerClientCreateTests } from './meetings.client-create.tests'
import { registerMeetingsTests } from './meetings.tests'
import { registerMigrationTests } from './meetings.migration.tests'
import { registerPrivacyTests } from './meetings.privacy.tests'
import { registerScenariosTests } from './meetings.scenarios.tests'
import { registerSessionTests } from './meetings.session.tests'
import { registerStartTests } from './meetings.start.tests'
import { registerWorkspaceOwnerTests } from './meetings.workspace-owner.tests'

test.describe('love (meetings) — suite', () => {
  registerMeetingsTests()
  registerAccessTests()
  registerMigrationTests()
  registerPrivacyTests()
  registerStartTests()
  registerSessionTests()
  registerInviteTests()
  registerInviteUiTests()
  registerConnectTests()
  registerKnockOfficeTests()
  registerClientCreateTests()
  registerScenariosTests()
  registerWorkspaceOwnerTests()
  registerBidirectionalLoopTests()
  registerGuestTests()
})
