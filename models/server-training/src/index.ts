//
// Copyright @ 2022 Hardcore Engineering Inc.
//
import { type Builder } from '@intabiafusion/model'

import training from '@intabiafusion/model-training'
import serverTraining from '@intabiafusion/server-training'
import core from '@intabiafusion/core'
import notification from '@intabiafusion/notification'
import serverNotification from '@intabiafusion/server-notification'
import serverActivity from '@intabiafusion/server-activity'

export { serverTrainingId } from '@intabiafusion/server-training/src/index'

export function createModel (builder: Builder): void {
  builder.mixin(
    training.notification.TrainingRequest,
    notification.class.NotificationType,
    serverNotification.mixin.TypeMatch,
    {
      match: serverTraining.function.TrainingRequestNotificationTypeMatch
    }
  )

  builder.mixin(training.class.TrainingRequest, core.class.Class, serverActivity.mixin.TitlePresenter, {
    presenter: serverTraining.function.TrainingRequestTitlePresenter
  })

  builder.mixin(training.class.TrainingRequest, core.class.Class, serverActivity.mixin.UrlPresenter, {
    presenter: serverTraining.function.TrainingRequestUrlPresenter
  })
}
