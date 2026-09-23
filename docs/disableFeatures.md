# Overview

A configuration guide, for self-hosted users.

## Disable features
Installation could have force disabled one of unused features for all workspaces.

Please set a DISABLED_FEATURES environment variable for front service container, a comma separated list is supported.

- auto-translate - Will disable auto translate
- github - Will disable Github
- mailboxes - Will disable Platform Mail
- export - Will disable export
- integrations - Will disable the Settings > Integrations page (the `integration` key only hides the per-channel "add integration" button in the contact editor, not the Settings page)
- backup - Will disable backup UI
- invites - Will disable invites UI
- documents - Will disable Control Documents
- calendar - Will disable Calendar UI
- inventory - Will disable inventory
- survey - Will disable Surveys
- lead - Will disable leads
- products - Will disable products
- telegram - Will disable telegram
- recruit - Will disable Recruit
- training - Will disable trainings
- testManagement - Will disable test management
- process - Will disable process module
- card - Will disable cards
- hide-ru-banned-channels - Will hide channels banned in Russia

## Связанные документы

- [platform-infra.md](./features/platform-infra.md)
