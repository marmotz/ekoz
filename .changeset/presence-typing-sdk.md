---
"@ekozhq/sdk": minor
---

Add `client.presence` (`heartbeat()`, `setManualAway()`, `typing()`) and its `reporter`,
the heartbeat loop of a client instance with idle state, manual away and throttled typing
signals (`signOff()` makes the user appear away before a voluntary sign-out), plus the `HeartbeatResponse` and `PresencePreferenceResponse` types (issue #132).
