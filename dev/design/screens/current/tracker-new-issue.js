// New issue dialog (CreateIssue) over the issue list: a 20% dim covers the whole window, the dialog sits at the top center.
// Runs after tracker-issues.js, which builds the dimmed backdrop.
const st0 = DEMO.en.statuses.find((s) => s.name === project.defaultStatus) || DEMO.en.statuses[0]
kit.at(frame, kit.box('Overlay', { w: 1920, h: 1080, fill: '#00000033' }), 0, 0)
kit.at(frame, kit.NewIssuePopup({ project: project.name, statusName: st0.name, cat: st0.category, color: st0.color }), 594, 150)
await kit.settle()
return frame.id
