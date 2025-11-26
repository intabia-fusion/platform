//
// Copyright @ 2022 Hardcore Engineering Inc.
//
import { type Builder } from '@hcengineering/model'

export { serverTrainingId } from '@hcengineering/server-training/src/index'

export function createModel (builder: Builder): void {
  // TODO: FIXME
  // builder.mixin(
  //   training.notification.TrainingRequest,
  //   notification.class.NotificationType,
  //   serverNotification.mixin.TypeMatch,
  //   {
  //     func: serverTraining.function.TrainingRequestNotificationTypeMatch
  //   }
  // )
  //
  // builder.mixin(training.class.TrainingRequest, core.class.Class, serverNotification.mixin.TextPresenter, {
  //   presenter: serverTraining.function.TrainingRequestTextPresenter
  // })
  //
  // builder.mixin(training.class.TrainingRequest, core.class.Class, serverNotification.mixin.HTMLPresenter, {
  //   presenter: serverTraining.function.TrainingRequestHTMLPresenter
  // })
}
