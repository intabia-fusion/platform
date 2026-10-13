# Activity filters

- `filterMessages` (plugins/activity-resources/src/activityMessagesUtils.ts) returns everything when all filters are enabled; once any filter is off, a message is shown only if some enabled filter accepts it. A bug in one filter therefore shows up only after another category is unchecked.
- `attributesFilter` used to require `DocUpdateMessage.objectClass === doc._class`. Messages written before a class change (task type change, older data) keep the old `objectClass`, so own attribute updates vanished. Own updates now match by `objectId === attachedTo`.
- Collection updates of other classes (labels via `TagReference`, attachments) are not accepted by `attributesFilter`; attachments have their own filter, labels have none.
