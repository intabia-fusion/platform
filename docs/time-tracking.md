# Time Tracking & Estimation System

## Overview

The time tracking system provides estimation, time reporting, and progress visualization for Issues. It supports hierarchical issue structures (parent/sub-issues) with automatic aggregation of time data across the tree.

**Key concepts:**
- **Estimation** — planned effort (in man-hours) set manually on each issue
- **TimeSpendReport** — individual time entries recorded against an issue
- **reportedTime** — auto-computed sum of all TimeSpendReport values for an issue
- **remainingTime** — auto-computed via `reduceChildInfoTree`, accounts for the full subtree
- **childInfo** — denormalized cache of child issues' estimation/reportedTime on the parent, with `parentId` for tree-based aggregation

---

## Data Model

### Issue (time-related fields)

```typescript
interface Issue extends Task {
  estimation: number           // Planned effort in man-hours (manually set)
  reportedTime: number         // Sum of all TimeSpendReport.value (auto-maintained by server trigger)
  remainingTime: number        // max(0, totalEstimation - totalReportedTime) via reduceChildInfoTree (auto-computed, @ReadOnly)
  reports: CollectionSize<TimeSpendReport>  // Collection of time entries
  childInfo: IssueChildInfo[]  // Denormalized child estimation/reportedTime cache
  parents: IssueParentInfo[]   // Full ancestor chain (all levels up to root)
}
```

### IssueChildInfo

Stored on a **parent** issue. Contains denormalized estimation and reported time for **all descendants** (not just direct children).

```typescript
interface IssueChildInfo {
  childId: Ref<Issue>
  estimation: number      // Descendant's own estimation in man-hours
  reportedTime: number    // Descendant's own reportedTime in man-hours
  parentId?: Ref<Issue>   // Direct parent of this descendant (for tree-based aggregation)
}
```

The `parentId` field stores the `attachedTo` reference of the descendant issue — i.e., its **direct parent** in the hierarchy. This turns the flat `childInfo` array into a tree structure, enabling correct bottom-up aggregation without double-counting.

> **Important:** `childInfo` contains entries for **all descendants at all levels**, not just direct children. When a sub-sub-issue is created, its `childInfo` entry is pushed to every ancestor in its `parents` chain — the immediate parent, the grandparent, etc. This is because `parents` stores the full ancestor chain, and `updateIssueParentEstimations` iterates over all of them.

> **Legacy compatibility:** The `parentId` field is optional. Data created before the migration will not have it. The `reduceChildInfoTree` function detects this and falls back to flat summation for backward compatibility.

### IssueParentInfo

Stored on a **child** issue. Contains the full ancestor chain from immediate parent up to root.

```typescript
interface IssueParentInfo {
  parentId: Ref<Issue>
  identifier: string
  parentTitle: string
  space: Ref<Space>
}
```

### TimeSpendReport

Individual time entry attached to an issue.

```typescript
interface TimeSpendReport extends AttachedDoc {
  attachedTo: Ref<Issue>          // The issue this report belongs to
  employee: Ref<Employee> | null  // Who spent the time
  date: Timestamp | null          // When the work was done
  value: number                   // Time spent in man-hours (supports up to 3 decimal places)
  description: string             // Free-text description of work done
}
```

---

## Tree-Based Aggregation (`reduceChildInfoTree`)

Defined in `plugins/tracker/src/index.ts`. Used by both server triggers and UI components.

```typescript
function reduceChildInfoTree(
  childInfo: IssueChildInfo[],
  ownEstimation: number,
  ownReportedTime: number
): { totalEstimation: number, totalReportedTime: number }
```

### Algorithm

1. **Empty childInfo** → returns `{ totalEstimation: ownEstimation, totalReportedTime: ownReportedTime }`
2. **Legacy fallback** (any entry lacks `parentId`) → flat summation: `ownEstimation + sum(child.estimation)`, same for reportedTime
3. **Tree mode** (all entries have `parentId`):
   - Builds a tree using `parentId` to group children
   - Root children = entries whose `parentId` is not in the `childInfo` set (direct children of the owner issue)
   - Bottom-up (post-order) aggregation:
     - `effectiveEst(node) = max(node.estimation, sum(children.effectiveEst))`
     - `effectiveRep(node) = node.reportedTime + sum(children.effectiveRep)`
   - Final result:
     - `totalEstimation = max(ownEstimation, sum(rootChildren.effectiveEst))`
     - `totalReportedTime = ownReportedTime + sum(rootChildren.effectiveRep)`

### Example

```
Epic(est=10) → Task(est=0) → Subtask(est=20, rep=5)

Subtask: leaf → effectiveEst=20, effectiveRep=5
Task:    effectiveEst=max(0, 20)=20, effectiveRep=0+5=5
Epic:    totalEstimation=max(10, 20)=20, totalReportedTime=epicRep+5

No double-counting: Subtask's estimation is counted once through Task, not separately.
```

---

## Server-Side Logic (Triggers)

All server-side logic is in `server-plugins/tracker-resources/src/index.ts`.

The main trigger `OnIssueUpdate` fires on any CUD (Create/Update/Delete) operation on `Issue` or `TimeSpendReport` classes.

### Trigger Registration

Defined in `models/server-tracker/src/index.ts`:

```typescript
builder.createDoc(serverCore.class.Trigger, core.space.Model, {
  trigger: serverTracker.trigger.OnIssueUpdate,
  txMatch: {
    objectClass: { $in: [tracker.class.Issue, tracker.class.TimeSpendReport] }
  }
})
```

### Data Flow Diagram

```
TimeSpendReport CREATE/UPDATE/DELETE
    → OnIssueUpdate
    → doTimeReportUpdate()
    → $inc reportedTime on parent Issue
    → Recompute remainingTime via reduceChildInfoTree
    → updateIssueParentEstimations() → $pull + $push childInfo (with parentId) on ALL ancestor issues

Issue estimation/reportedTime UPDATE
    → OnIssueUpdate
    → doIssueUpdate()
    → Recompute remainingTime via reduceChildInfoTree
    → Emit TxUpdateDoc(remainingTime)
    → updateIssueParentEstimations() → refresh childInfo on ALL ancestors

Issue CREATE
    → OnIssueUpdate
    → updateIssueParentEstimations(sourceParents=[], targetParents=issue.parents)
    → Push new childInfo entry (with parentId=issue.attachedTo) into all ancestors

Issue DELETE
    → OnIssueUpdate
    → updateIssueParentEstimations(estimation:0, reportedTime:0, sourceParents=..., targetParents=[])
    → Pull childInfo from all ancestors

Issue REPARENT (attachedTo change)
    → OnIssueUpdate
    → doIssueUpdate()
    → Update own parents[] array
    → updateSubIssues() — recursive parents[] update in all descendants
    → updateIssueParentEstimations(sourceParents=old, targetParents=new, overrideParentId=newParent)
    → migrate childInfo with updated parentId
```

### TimeSpendReport Handling (`doTimeReportUpdate`)

#### Create

```
1. Atomically increment reportedTime: $inc { reportedTime: report.value }
2. Recalculate: remainingTime = max(0, max(estimation, totalEstimation) - totalReportedTime)
   where totalEstimation/totalReportedTime come from reduceChildInfoTree
3. Propagate to all ancestors via updateIssueParentEstimations()
```

#### Update (value changed)

```
1. Reconstruct old document by replaying all previous transactions (excluding current)
2. Compute delta = newValue - oldValue
3. Atomically update: $inc { reportedTime: delta }
4. Recalculate remainingTime via reduceChildInfoTree
5. Propagate to ancestors
```

#### Delete

```
1. Reconstruct old document to get removed value
2. Atomically decrement: $inc { reportedTime: -oldValue }
3. Recalculate remainingTime via reduceChildInfoTree
4. Propagate to ancestors
```

### childInfo Update Mechanism (`updateIssueParentEstimations`)

This function maintains the `childInfo` array on parent issues **incrementally** (not via full recomputation):

1. For every parent in `sourceParents`: emit `$pull { childInfo: { childId: issue._id } }` — remove old entry
2. For every parent in `targetParents`: emit `$push { childInfo: { childId, estimation, reportedTime, parentId } }` — insert updated entry

The `parentId` in each pushed entry is set to `overrideParentId ?? issue.attachedTo`. The `overrideParentId` parameter is used during reparent operations where `issue.attachedTo` still holds the old value but the new parent is known.

This runs whenever:
- An issue is created (push to all ancestors)
- An issue is deleted (pull from all ancestors)
- An issue is reparented (pull from old ancestors, push to new ancestors with new parentId)
- An issue's estimation or reportedTime changes (pull old + push new for same ancestors)

### remainingTime Calculation

`remainingTime` is **always derived** on the server, never set directly by the client:

```typescript
const { totalEstimation, totalReportedTime } = reduceChildInfoTree(
  issue.childInfo ?? [], issue.estimation, issue.reportedTime
)
issue.remainingTime = Math.max(0, Math.max(issue.estimation, totalEstimation) - totalReportedTime)
```

This ensures that if child issues have more estimation than the parent, the remaining time reflects the actual work scope. It is marked `@ReadOnly()` in the model. Recalculated in:
- `doTimeReportUpdate()` — after any TimeSpendReport change
- `doIssueUpdate()` — after estimation or reportedTime is directly modified

---

## UI Components

All time-tracking components are in:
`plugins/tracker-resources/src/components/issues/timereport/`

All UI components use `reduceChildInfoTree` to aggregate child data instead of flat `map/reduce` summation.

### Component Hierarchy

```
EstimationEditor (main entry point, used in issue lists and detail views)
  ├── [list mode] EstimationStatsPresenter
  │     ├── EstimationProgressCircle (SVG circular progress, 1-2 rings)
  │     └── TimePresenter (reportedTime / estimation)
  │     [on:click] → EstimationPopup
  └── [normal mode] Button + TimePresenter
        [on:click] → EditBoxPopup (inline number editor)

EstimationPopup (detailed estimation/time tracking dialog)
  ├── Header: EstimationStatsPresenter (clickable → EditBoxPopup) + RemainingTime
  ├── Sub-issue stats: EstimationProgressCircle + reportedTime/estimation + RemainingTime
  ├── TimeSpendReports (expandable section)
  │     ├── MiniToggle "SubIssues" (toggle to include child reports)
  │     └── TimeSpendReportsList
  │           └── [on:click row] → TimeSpendReportPopup (edit mode)
  ├── SubIssuesEstimations (expandable section)
  │     └── EstimationSubIssueList
  │           └── EstimationEditor (recursive, list mode)
  └── [Add button] → TimeSpendReportPopup (create mode)

ReportedTimeEditor (used in issue detail sidebar)
  ├── [on:click body] → ReportsPopup (full TableBrowser of time reports)
  └── [on:click +] → TimeSpendReportPopup (create mode)
```

### Key Components

#### TimePresenter
Formats a number (man-hours) into human-readable string like "2h 30m". Calculates hours (`Math.floor(value)`) and minutes (`(value % 1) * 60`).

#### EstimationProgressCircle
SVG circular progress bar (16x16). Supports multiple concentric rings (for own issue + child issues):
- **Green gradient** (0–100%): on track
- **Red gradient** (100–200%): over estimation
- **Black** (>200%): severely over
- Animated transitions (0.6s ease)

#### EstimationStatsPresenter
Shows `EstimationProgressCircle` + text `reportedTime / estimation`. Uses `reduceChildInfoTree(childInfo, 0, 0)` to compute child aggregates:
- Displays `own.reportedTime + tree.totalReportedTime` as total reported
- In `list` mode: estimation shown as `max(own.estimation, tree.totalEstimation)`
- CSS indicators: **red** if total reported > own estimation, **orange** if tree estimation > own estimation

#### EstimationPopup
Full dialog for estimation management. Uses `reduceChildInfoTree` for sub-issue stats. Shows:
- Own estimation (editable) + remaining time
- Sub-issue aggregated stats (if children exist)
- All time reports (with toggle for sub-issues)
- Sub-issue estimation breakdown
- "Add time report" button

#### ReportedTimeEditor
Uses `reduceChildInfoTree(childInfo, 0, 0).totalReportedTime` for child time. Shows total (own + child) and breakdown.

#### KanbanView
Uses `reduceChildInfoTree(issue.childInfo, issue.estimation, issue.reportedTime)` to compute `reports` and `estimations` for footer display.

#### IssueStatistics (Milestone view)
For each root issue (no parent in current set), uses `reduceChildInfoTree` to compute total estimation and reported time. Applies Won/Lost status logic on top of tree-aggregated values.

#### TimeSpendReportPopup
Form for creating/editing a TimeSpendReport:
- Numeric input for hours (up to 3 decimal places)
- Quick buttons: 1h, 2h, 4h, 6h, 7h, 8h
- Employee selector
- Day type: "Current Work Day" / "Previous Work Day"
- Date picker
- Description field

#### TimeSpendReportList (Calendar View)
Grid-based calendar view showing time reports per person per day:
- Navigation header (back/forward + Today)
- PersonCalendar grid with person rows × day columns
- Weekend highlighting
- Click on issue → EstimationPopup
- Person summary → PersonReportsPopup

---

## Migration

### `childInfo-parentId` (upgrade migration)

Defined in `models/tracker/src/migration.ts`. Populates the `parentId` field on existing `childInfo` entries:

1. Loads all Issues with projection `{ _id, childInfo }`
2. Filters issues that have non-empty `childInfo`
3. Collects `childId`s from entries missing `parentId`
4. Loads those child issues with projection `{ _id, attachedTo }`
5. Updates each parent issue's `childInfo` array, setting `parentId = child.attachedTo`

After migration, `reduceChildInfoTree` switches from legacy flat summation to tree-based aggregation automatically.

---

## Known Behaviors and Edge Cases

1. **childInfo is incremental, not recomputed** — The `childInfo` array on parent issues is maintained via `$pull` + `$push` operations on each change. There is no periodic or bulk recomputation. If data gets out of sync (e.g., due to a failed transaction), it may require manual correction.

2. **remainingTime cannot go negative** — The formula uses `Math.max(0, ...)`, so even if `reportedTime > estimation`, `remainingTime` will be 0.

3. **childInfo propagates to ALL ancestors** — When a sub-sub-issue's estimation changes, the `childInfo` update propagates up through every level of the hierarchy (parent, grandparent, etc.), not just the immediate parent. Each ancestor gets a separate `childInfo` entry for the changed descendant with the same `parentId` (the descendant's direct parent).

4. **TimeSpendReport value reconstruction** — When updating or deleting a TimeSpendReport, the server reconstructs the old document by replaying all previous transactions. This ensures correct delta calculation even if the original document state isn't directly available.

5. **Legacy data handling** — If any `childInfo` entry lacks `parentId`, `reduceChildInfoTree` falls back to flat summation (pre-migration behavior). This ensures backward compatibility during rolling upgrades.

6. **Tree aggregation prevents double-counting** — With `parentId`, the tree structure ensures that a sub-sub-issue's estimation is counted once through its parent, not independently added at each ancestor level. For example: Epic(est=10) → Task(est=0) → Subtask(est=20) yields totalEstimation=20 for Epic, not 20+20=40.

7. **Reparent uses overrideParentId** — During reparent, `issue.attachedTo` still holds the old parent. The `overrideParentId` parameter ensures the new `parentId` is written to `childInfo` entries pushed to the new ancestor chain.
