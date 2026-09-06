# Tasks to do

Only tasks whose deliverable is in this repository (protocol spec, cross-cutting docs and ADRs). Server / SDK / client
tasks live in those repositories' backlogs. Issues are created in `ekoz-chat/spec`.

Implement in dependency order; each task file has a `## Dependencies` section and each issue body carries
`Depends on ekoz-chat/<repo>#N` lines.

| Done | Issue                                            | Task                                                                | Description                                                                              |
|------|--------------------------------------------------|---------------------------------------------------------------------|------------------------------------------------------------------------------------------|
| ☐   | [#1](https://github.com/ekoz-chat/spec/issues/1) | [1-conv-protocol-sections](tasks/1-conv-protocol-sections.md)       | Protocol sections for conversations (spaces/rooms/permissions, messages, presence, sync) |
| ☑   | [#2](https://github.com/ekoz-chat/spec/issues/2) | [2-adr-0025-sdk-packaging](tasks/2-adr-0025-sdk-packaging.md)       | the SDK packaging and protocol-version policy design: SDK packaging, distribution and protocol-version policy                        |
| ☐   | [#3](https://github.com/ekoz-chat/spec/issues/3) | [3-protocol-identity-section](tasks/3-protocol-identity-section.md) | Protocol "Identity and profiles" section                                                 |
