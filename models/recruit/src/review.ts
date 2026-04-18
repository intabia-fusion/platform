import { type FindOptions } from '@intabiafusion/core'
import { type Builder } from '@intabiafusion/model'
import calendar from '@intabiafusion/model-calendar'
import contact from '@intabiafusion/model-contact'
import core, { defineCollaborators } from '@intabiafusion/model-core'
import view, { createAction } from '@intabiafusion/model-view'
import { type Review } from '@intabiafusion/recruit'
import { type BuildModelKey } from '@intabiafusion/view'
import notification, { type MessageNotificationType } from '@intabiafusion/notification'
import { generateClassNotificationTypes } from '@intabiafusion/model-notification'
import activity from '@intabiafusion/activity'

import recruit from './plugin'

export const reviewTableOptions: FindOptions<Review> = {
  lookup: {
    attachedTo: recruit.mixin.Candidate,
    participants: contact.mixin.Employee,
    company: contact.class.Organization
  }
}
export const reviewTableConfig: (BuildModelKey | string)[] = [
  '',
  'title',
  '$lookup.attachedTo',
  // 'verdict',
  { key: '', presenter: recruit.component.OpinionsPresenter, label: recruit.string.Opinions, sortingKey: 'opinions' },
  {
    key: '$lookup.participants',
    presenter: calendar.component.PersonsPresenter,
    label: calendar.string.Participants,
    sortingKey: '$lookup.participants'
  },
  '$lookup.company',
  { key: '', presenter: calendar.component.DateTimePresenter, label: calendar.string.Date, sortingKey: 'date' },
  'modifiedOn'
]

export function createReviewModel (builder: Builder): void {
  builder.mixin(recruit.class.Review, core.class.Class, view.mixin.CollectionEditor, {
    editor: recruit.component.Reviews
  })

  defineCollaborators(builder, recruit.class.Review, { fields: ['createdBy'] })

  createTableViewlet(builder)

  createAction(
    builder,
    {
      label: recruit.string.CreateOpinion,
      icon: recruit.icon.Create,
      action: recruit.actionImpl.CreateOpinion,
      input: 'focus',
      category: recruit.category.Recruit,
      target: recruit.class.Review,
      context: {
        mode: ['context', 'browser'],
        group: 'create'
      }
    },
    recruit.action.CreateOpinion
  )

  builder.mixin(recruit.class.Review, core.class.Class, view.mixin.ObjectEditor, {
    editor: recruit.component.EditReview
  })

  builder.mixin(recruit.class.Review, core.class.Class, view.mixin.ObjectPresenter, {
    presenter: recruit.component.ReviewPresenter
  })

  builder.mixin(recruit.class.Opinion, core.class.Class, view.mixin.ObjectPresenter, {
    presenter: recruit.component.OpinionPresenter
  })

  createAction(builder, {
    action: view.actionImpl.ShowPopup,
    actionProps: {
      component: recruit.component.CreateReview,
      element: 'top',
      props: {
        preserveCandidate: true
      },
      fillProps: {
        space: '_space',
        _id: 'candidate'
      }
    },
    label: recruit.string.CreateReview,
    icon: recruit.icon.Schedule,
    input: 'focus',
    category: recruit.category.Recruit,
    target: recruit.mixin.Candidate,
    context: {
      mode: ['context', 'browser'],
      group: 'associate'
    }
  })

  builder.createDoc(
    view.class.Viewlet,
    core.space.Model,
    {
      attachTo: recruit.class.Review,
      descriptor: calendar.viewlet.Calendar,
      // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
      config: [
        '',
        'title',
        '$lookup.attachedTo',
        '$lookup.company',
        { key: '', presenter: calendar.component.DateTimePresenter, label: calendar.string.Date, sortingKey: 'date' }
      ]
    },
    recruit.viewlet.CalendarReview
  )

  builder.createDoc(
    notification.class.NotificationGroup,
    core.space.Model,
    {
      label: recruit.string.Review,
      icon: recruit.icon.Reviews,
      objectClass: recruit.class.Review
    },
    recruit.ids.ReviewNotificationGroup
  )

  builder.createDoc<MessageNotificationType>(
    notification.class.MessageNotificationType,
    core.space.Model,
    {
      hidden: false,
      generated: false,
      label: recruit.string.NewReview,
      group: recruit.ids.ReviewNotificationGroup,
      match: {
        action: 'create'
      },
      objectClass: recruit.class.Review,
      attachedToClass: recruit.class.Review,
      messageClass: activity.class.DocUpdateMessage,
      defaultEnabled: true,
      templates: {
        text: recruit.emailTemplate.ReviewCreateNotificationText,
        html: recruit.emailTemplate.ReviewCreateNotificationHtml,
        subject: recruit.emailTemplate.ReviewCreateNotificationSubject
      }
    },
    recruit.ids.ReviewCreateNotification
  )

  generateClassNotificationTypes(builder, recruit.class.Review, recruit.ids.ReviewNotificationGroup, [], ['comments'])
}

function createTableViewlet (builder: Builder): void {
  builder.createDoc(
    view.class.Viewlet,
    core.space.Model,
    {
      attachTo: recruit.class.Review,
      descriptor: view.viewlet.Table,
      config: reviewTableConfig
    },
    recruit.viewlet.TableReview
  )

  builder.mixin(recruit.class.Opinion, core.class.Class, view.mixin.CollectionEditor, {
    editor: recruit.component.Opinions
  })
}
