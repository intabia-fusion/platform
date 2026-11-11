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

import calendar, { AccessLevel, type Event } from '@hcengineering/calendar'
import core, { type Class, type Doc, type Ref, type TxMixin, TxFactory } from '@hcengineering/core'
import type { TriggerControl } from '@hcengineering/server-core'
import { onEventMixin } from '../index'

const owner = 'event:master' as Ref<Event>
const occurrence = 'event:occurrence' as Ref<Event>

function eventDoc (id: Ref<Event>, cls: Ref<Class<Doc>>, access: AccessLevel): Event {
  return { _id: id, _class: cls, eventId: 'E1', access } as unknown as Event
}

/**
 * The trigger only reads the stored document and asks the hierarchy what it is; a queue is absent,
 * so `putEventToQueue` returns without sending anything.
 */
function controlFor (event: Event): { control: TriggerControl, created: number } {
  const state = { created: 0 }
  const control = {
    // The trigger reports a rejected mixin write; a bare object would throw before the assertion.
    ctx: { warn: jest.fn(), error: jest.fn(), info: jest.fn() },
    findAll: jest.fn(async () => [event]),
    txFactory: new TxFactory(core.account.System),
    hierarchy: {
      isDerived: (cls: Ref<Class<Doc>>, parent: Ref<Class<Doc>>) => cls === parent
    },
    queue: undefined
  } as unknown as TriggerControl
  return { control, created: state.created }
}

function mixinTx (id: Ref<Event>): TxMixin<Event, Event> {
  return {
    _class: core.class.TxMixin,
    objectId: id,
    objectClass: calendar.class.Event,
    mixin: 'love:mixin:MeetingEventLink',
    attributes: {}
  } as unknown as TxMixin<Event, Event>
}
describe('onEventMixin', () => {
  it('propagates the mixin from the master to the participant copies', async () => {
    const { control } = controlFor(eventDoc(owner, calendar.class.ReccuringEvent, AccessLevel.Owner))

    const txes = await onEventMixin(mixinTx(owner), control)

    // The fake store answers every query with the master itself, so the copy list is empty here:
    // what matters is that the call did not bail out before looking for copies.
    expect(control.findAll).toHaveBeenCalledWith(control.ctx, calendar.class.Event, { eventId: 'E1' })
    expect(txes).toEqual([])
  })

  it('does not spread the mixin of an occurrence to the series', async () => {
    // An occurrence is a ReccuringInstance that keeps access: 'owner' in the calendar of whoever
    // moved it; a mixin there would give the meeting a second identity.
    const { control } = controlFor(eventDoc(occurrence, calendar.class.ReccuringInstance, AccessLevel.Owner))

    const txes = await onEventMixin(mixinTx(occurrence), control)

    expect(txes).toEqual([])
    // Only the lookup of the event itself: the series was never enumerated.
    expect(control.findAll).toHaveBeenCalledTimes(1)
    // A client that writes the mixin where it does not belong is a bug worth seeing in the log.
    expect(control.ctx.warn).toHaveBeenCalled()
  })

  it('ignores a participant copy', async () => {
    const { control } = controlFor(eventDoc(owner, calendar.class.Event, AccessLevel.Reader))

    expect(await onEventMixin(mixinTx(owner), control)).toEqual([])
    expect(control.findAll).toHaveBeenCalledTimes(1)
  })
})
