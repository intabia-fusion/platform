/**
  Copyright © 2026 Intabia Fusion.

  Licensed under the Eclipse Public License, Version 2.0 (the "License");
  you may not use this file except in compliance with the License. You may
  obtain a copy of the License at https://www.eclipse.org/legal/epl-2.0

  Unless required by applicable law or agreed to in writing, software
  distributed under the License is distributed on an "AS IS" BASIS,
  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.

  See the License for the specific language governing permissions and
  limitations under the License.
*/

import { type Ref } from '@hcengineering/core'
import { type Issue, type IssueChildInfo, reduceChildInfoTree } from '..'

function makeChildInfo (childId: string, estimation: number, reportedTime: number, parentId?: string): IssueChildInfo {
  return {
    childId: childId as Ref<Issue>,
    estimation,
    reportedTime,
    parentId: parentId as Ref<Issue> | undefined
  }
}

describe('reduceChildInfoTree', () => {
  it('should return own values when childInfo is empty', () => {
    const result = reduceChildInfoTree([], 10, 3)
    expect(result.totalEstimation).toBe(10)
    expect(result.totalReportedTime).toBe(3)
  })

  it('should use flat summation fallback when entries lack parentId (legacy)', () => {
    const childInfo: IssueChildInfo[] = [makeChildInfo('c1', 5, 2), makeChildInfo('c2', 3, 1)]
    const result = reduceChildInfoTree(childInfo, 10, 4)
    // Flat: estimation = 10 + 5 + 3 = 18, reportedTime = 4 + 2 + 1 = 7
    expect(result.totalEstimation).toBe(18)
    expect(result.totalReportedTime).toBe(7)
  })

  it('should use flat summation when some entries have parentId and some do not (mixed/legacy)', () => {
    const childInfo: IssueChildInfo[] = [
      makeChildInfo('c1', 5, 2, 'root'),
      makeChildInfo('c2', 3, 1) // no parentId => legacy
    ]
    const result = reduceChildInfoTree(childInfo, 10, 4)
    expect(result.totalEstimation).toBe(18)
    expect(result.totalReportedTime).toBe(7)
  })

  it('should aggregate direct children correctly', () => {
    // Root issue (own est=10, rep=2), two direct children
    const childInfo: IssueChildInfo[] = [makeChildInfo('c1', 5, 1, 'root'), makeChildInfo('c2', 8, 3, 'root')]
    // root children effectiveEst: c1=5, c2=8, sum=13
    // totalEstimation = max(10, 13) = 13
    // totalReportedTime = 2 + 1 + 3 = 6
    const result = reduceChildInfoTree(childInfo, 10, 2)
    expect(result.totalEstimation).toBe(13)
    expect(result.totalReportedTime).toBe(6)
  })

  it('should aggregate deep hierarchy (3 levels) without double-counting', () => {
    // Epic(est=10) -> Task(est=0) -> Subtask(est=20)
    // 'root' is the owner issue ID (not in childInfo)
    const childInfo: IssueChildInfo[] = [makeChildInfo('task', 0, 2, 'root'), makeChildInfo('subtask', 20, 5, 'task')]
    // subtask: leaf, effectiveEst=20, effectiveRep=5
    // task: effectiveEst=max(0, 20)=20, effectiveRep=2+5=7
    // root: totalEstimation=max(10, 20)=20, totalReportedTime=1+7=8
    const result = reduceChildInfoTree(childInfo, 10, 1)
    expect(result.totalEstimation).toBe(20)
    expect(result.totalReportedTime).toBe(8)
  })

  it('should use max(own, childSum) for estimation at each level', () => {
    // Parent(est=100) -> Child1(est=30) -> Grandchild(est=10)
    //                  -> Child2(est=50)
    const childInfo: IssueChildInfo[] = [
      makeChildInfo('child1', 30, 5, 'root'),
      makeChildInfo('child2', 50, 10, 'root'),
      makeChildInfo('grandchild', 10, 2, 'child1')
    ]
    // grandchild: leaf, effectiveEst=10
    // child1: effectiveEst=max(30, 10)=30, effectiveRep=5+2=7
    // child2: effectiveEst=50, effectiveRep=10
    // root: totalEstimation=max(100, 30+50)=100, totalReportedTime=0+7+10=17
    const result = reduceChildInfoTree(childInfo, 100, 0)
    expect(result.totalEstimation).toBe(100)
    expect(result.totalReportedTime).toBe(17)
  })

  it('should handle case where own estimation is lower than children sum', () => {
    const childInfo: IssueChildInfo[] = [makeChildInfo('c1', 20, 5, 'root'), makeChildInfo('c2', 30, 10, 'root')]
    // sum children est = 50, own = 5 -> max(5, 50) = 50
    const result = reduceChildInfoTree(childInfo, 5, 1)
    expect(result.totalEstimation).toBe(50)
    expect(result.totalReportedTime).toBe(16)
  })

  it('should handle single child correctly', () => {
    const childInfo: IssueChildInfo[] = [makeChildInfo('c1', 15, 3, 'root')]
    const result = reduceChildInfoTree(childInfo, 10, 2)
    // totalEstimation = max(10, 15) = 15
    // totalReportedTime = 2 + 3 = 5
    expect(result.totalEstimation).toBe(15)
    expect(result.totalReportedTime).toBe(5)
  })
})
