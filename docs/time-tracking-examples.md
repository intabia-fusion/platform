Тогда в моем решении:

SuperParent { // Оценка 10, но по детям 5,12, показываем сумму 17, но красным превысили.
  childInfo: [Parent1, Parent2, Child1, Child2, Child3, Child4], 
  estimation :10,
  timeReport: [2]
}
Parent1 { // Оценки детей 8 + 4 = 12, превысили оценку на 8, показываем 12 но красным
  childInfo: [Child1, Child2]
  estimation: 4
}
Parent2 { // Оценки детей 2 + 2 = 4, осталось 1 час свободным
  childInfo: [Child3, Child4]
  estimation: 5
}

Child1 { // Честная оценка и отчеты
  estimation: 8
}
Child2 { // Честная оценка и отчеты
  estimation: 4
}
Child3 { // Честная оценка и отчеты
  estimation: 2
}
Child4 { // Честная оценка и отчеты
  estimation: 2
}
