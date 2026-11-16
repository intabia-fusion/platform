# Invite right after connecting moved the call into the caller's office

`sendInvites` took the meeting from `currentMeetingMinutes` (derived from ParticipantInfo, written by the webhook ~1s after connect); an invite in that window had no `meeting` and the accept hosted the call in the caller's office.
Fix: fall back to `currentMeeting` from `meetings.ts` while `lkSessionConnected`. Needs a front rebuild to verify e2e.
