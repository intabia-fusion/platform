//
// Copyright @ 2024 Hardcore Engineering Inc.
//

import type { Question } from '@intabiafusion/questions'
import type { Class, Ref } from '@intabiafusion/core'
import { getClient } from '@intabiafusion/presentation'
import questions from '../plugin'

export function getQuestionClasses (
  baseClass: Ref<Class<Question<unknown>>> = questions.class.Question
): Array<Class<Question<unknown>>> {
  const hierarchy = getClient().getHierarchy()
  return hierarchy
    .getDescendants(baseClass)
    .map((classRef) => hierarchy.getClass(classRef))
    .filter((_class) => hierarchy.hasMixin(_class, questions.mixin.QuestionMixin))
}
