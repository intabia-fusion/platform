//
// Copyright @ 2024 Hardcore Engineering Inc.
//

import type {
  Answer,
  AnswerDataAssessFunction,
  Assessment,
  Question,
  QuestionInitFunction,
  QuestionMixin,
  QuestionDataPresenter,
  QuestionDataEditor,
  AnswerDataPresenter,
  AnswerDataEditor
} from '@intabiafusion/questions'
import type { Class, Ref } from '@intabiafusion/core'
import { Mixin } from '@intabiafusion/model'
import core, { TClass } from '@intabiafusion/model-core'
import type { Resource } from '@intabiafusion/platform'
import questions from '../plugin'

/** @public */
@Mixin(questions.mixin.QuestionMixin, core.class.Class)
export class TQuestionMixin<Q extends Question<any>, A extends Answer<Q, any>>
  extends TClass
  implements QuestionMixin<Q, A> {
  questionInit!: Resource<QuestionInitFunction<Q>>
  questionDataPresenter!: Resource<QuestionDataPresenter<Q>>
  questionDataEditor!: Resource<QuestionDataEditor<Q>>
  answerClassRef!: Ref<Class<A>>
  answerDataPresenter!: Resource<AnswerDataPresenter<Q, A>>
  answerDataEditor!: Resource<AnswerDataEditor<Q, A>>
  answerDataAssess!: Q extends Assessment<any, any> ? Resource<AnswerDataAssessFunction<Q, A>> : null
}
