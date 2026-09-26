# `http/` — manual API collection (Hurl)

Hand-run requests to _use_ and explore the API against a locally running server.
**This is not an automated suite** — that lives in `src/**/*.e2e-spec.ts`. These
`.hurl` files double as living documentation of the current endpoints.

**One request per file, one directory per endpoint group.** Hurl writes only the
last entry's response body to stdout, so a multi-request file hides all but the
last response. One request per file means running it always shows its response.

**Every endpoint has a file per outcome.** The plain name (`login.hurl`,
`create.hurl`, …) is the happy path; siblings cover the error outcomes
(`login-invalid.hurl`, `create-forbidden.hurl`, …).

## State a file needs

A file is only meaningful in a particular server state, called out in its
header. Three kinds:

- **Any state** — the error-path files that present a bogus token / bad
  credentials or a malformed body. These pass as-is, always
  (`policy.hurl`, `*-unauthenticated.hurl`, `login-invalid.hurl`, `refresh-invalid.hurl`,
  `register-needs-invitation.hurl`, `register-weak-password.hurl`,
  `verify-email-invalid.hurl`, `verify-email-resend.hurl`).
- **A captured value** — happy paths and owner/not-found cases that need
  `access_token`, `refresh_token`, `session_id`, `invite_token`,
  `invitation_id` or `verify_token`. Run the request that mints the value, copy
  it into `vars.env`, then run the dependent file. Order: `setup/create-owner`
  **or** `auth/login` → `invitations/create` → `auth/register` →
  `auth/verify-email` → the rest.
- **A specific config or a fresh database** — e.g. `setup/create-owner*` (fresh
  DB, no owner), `auth/register-closed.hurl` (`registration.mode = admin`),
  `metrics/scrape.hurl` (`metrics_enabled = true`). The header says which.

Because `setup/owner` is one-shot (a success closes setup for good), the
`setup/create-owner*` files can never all be green at once: on a fresh DB
`create-owner` + `create-owner-rejected` pass and `create-owner-closed` fails;
after setup it is the reverse.

## Layout

```
http/
  vars.env.example                    template — copy to vars.env (gitignored)
  health/
    healthz.hurl                      GET /healthz
    readyz.hurl                       GET /readyz
  discovery/
    well-known.hurl                   GET /.well-known/ekoz
  metrics/
    scrape.hurl                       GET /metrics                    (404 unless metrics_enabled)
  blobs/
    not-found.hurl                    GET /blobs/:id                  (404 until a feature adds a policy)
  setup/
    state.hurl                        GET /setup                      200 · public, any state
    create-owner.hurl                 POST /setup/owner               201 · fresh DB + real setup_token
    create-owner-rejected.hurl        POST /setup/owner               403 · bad token / email
    create-owner-closed.hurl          POST /setup/owner               410 · owner already exists
  auth/
    policy.hurl                       GET  /auth/policy               200 · public, any state
    login.hurl                        POST /auth/login                200 · needs an account
    login-invalid.hurl                POST /auth/login                401 auth.invalid_credentials
    login-unverified.hurl             POST /auth/login                403 identity.email_not_verified
    refresh.hurl                      POST /auth/refresh              200 · needs refresh_token
    refresh-invalid.hurl              POST /auth/refresh              401 auth.refresh_invalid
    refresh-reuse.hurl                POST /auth/refresh              401 auth.refresh_reuse
    logout.hurl                       POST /auth/logout               204 · needs access_token
    logout-unauthenticated.hurl       POST /auth/logout              401 auth.unauthenticated
    register.hurl                     POST /auth/register             201 · invite mode + invite_token
    register-needs-invitation.hurl    POST /auth/register             422 identity.invitation_invalid
    register-weak-password.hurl       POST /auth/register             422 identity.password_too_weak
    register-duplicate.hurl           POST /auth/register             409 identity.username_taken
    register-closed.hurl              POST /auth/register             403 identity.registration_closed
    verify-email.hurl                 POST /auth/verify-email         200 · needs verify_token
    verify-email-invalid.hurl         POST /auth/verify-email         422 identity.email_verification_invalid
    verify-email-resend.hurl          POST /auth/verify-email/resend  202 always
    password-reset-request.hurl       POST /auth/password-reset/request  202 always
    password-reset-confirm.hurl       POST /auth/password-reset/confirm  204 · needs reset_token
    password-reset-confirm-invalid.hurl POST /auth/password-reset/confirm 422 auth.password_reset_invalid
    login-throttled.hurl              POST /auth/login               401 · replay fast for 429 (§14)
  me/
    email.hurl                        POST   /me/email                202 · needs access_token
    email-unauthenticated.hurl        POST   /me/email                401 auth.unauthenticated
    email-wrong-password.hurl         POST   /me/email                401 auth.invalid_credentials
    email-taken.hurl                  POST   /me/email                409 identity.email_taken
    get.hurl                          GET    /me                      200 · needs access_token
    profile.hurl                      PATCH  /me/profile              200 · needs access_token
    avatar.hurl                       PUT    /me/avatar               200 · multipart, needs access_token
    avatar-delete.hurl                DELETE /me/avatar               204 · needs access_token
    password.hurl                     POST   /me/password             204 · needs access_token, changes the password
    password-wrong.hurl               POST   /me/password             401 auth.invalid_credentials
    password-weak.hurl                POST   /me/password             422 identity.password_too_weak
    username.hurl                     PATCH  /me/username             200/403 · policy-driven
    username-state.hurl               GET    /me/username             200 · needs access_token
    username-cancel.hurl              DELETE /me/username/request     204 · needs a pending request
    username-cancel-none.hurl         DELETE /me/username/request     404 identity.username_request_not_found
    delete.hurl                       DELETE /me                      204 · re-auth, throwaway account
  users/
    profile.hurl                      GET    /users/:identifier       200 · needs access_token
    summaries.hurl                    GET    /users?ids=              200 · needs access_token + target_user_id
    summaries-invalid.hurl            GET    /users?ids=              422 validation_failed
    profile-not-found.hurl            GET    /users/:identifier       404 identity.profile_not_found
    avatar.hurl                       GET    /users/:identifier/avatar 200 · ETag, needs access_token
    avatar-not-found.hurl             GET    /users/:identifier/avatar 404 identity.avatar_not_found
  invitations/
    create.hurl                       POST   /invitations             201 · needs owner access_token
    create-unauthenticated.hurl       POST   /invitations             401 auth.unauthenticated
    create-forbidden.hurl             POST   /invitations             403 auth.forbidden (non-owner)
    list.hurl                         GET    /invitations             200 · needs owner access_token
    list-unauthenticated.hurl         GET    /invitations             401 auth.unauthenticated
    revoke.hurl                       DELETE /invitations/:id          204 · needs owner + invitation_id
    revoke-unauthenticated.hurl       DELETE /invitations/:id          401 auth.unauthenticated
    revoke-not-found.hurl             DELETE /invitations/:id          404 identity.invitation_not_found
  admin/
    users-list.hurl                    GET    /admin/users                     200 · needs owner access_token
    users-list-forbidden.hurl          GET    /admin/users                     403 · non-owner
    user-get.hurl                      GET    /admin/users/:id                 200 · owner + target_user_id
    user-get-not-found.hurl            GET    /admin/users/:id                 404 identity.user_not_found
    user-password-reset.hurl           POST   /admin/users/:id/password-reset  202 · owner + target_user_id
    create-user.hurl                  POST   /admin/users             201 · needs owner access_token
    create-user-unauthenticated.hurl  POST   /admin/users             401 auth.unauthenticated
    create-user-forbidden.hurl        POST   /admin/users             403 auth.forbidden (non-owner)
    suspend.hurl                      POST   /admin/users/:id/suspend    204 · owner + target_user_id
    unsuspend.hurl                    POST   /admin/users/:id/unsuspend  204 · owner + target_user_id
    delete-user.hurl                  DELETE /admin/users/:id         204 · owner, throwaway target
    add-owner.hurl                    POST   /admin/owners            204 · owner + target_user_id
    remove-owner.hurl                 DELETE /admin/owners/:userId    204 · owner + target_user_id
    remove-owner-last.hurl            DELETE /admin/owners/:userId    409 identity.last_owner
    username-requests-list.hurl       GET    /admin/username-requests 200 · owner, approval mode
    username-requests-approve.hurl    POST   /admin/username-requests/:id/approve 201 · owner + request_id
    username-requests-reject.hurl     POST   /admin/username-requests/:id/reject  204 · owner + request_id
  sessions/
    list.hurl                         GET    /sessions                200 · needs access_token
    list-unauthenticated.hurl         GET    /sessions                401 auth.unauthenticated
    rename.hurl                       PATCH  /sessions/:id             200 · needs access_token + session_id
    rename-unauthenticated.hurl       PATCH  /sessions/:id             401 auth.unauthenticated
    rename-not-found.hurl             PATCH  /sessions/:id             404 identity.session_not_found
    revoke.hurl                       DELETE /sessions/:id             204 · needs access_token + session_id
    revoke-unauthenticated.hurl       DELETE /sessions/:id             401 auth.unauthenticated
    revoke-all.hurl                   DELETE /sessions?all=true        200 · needs access_token
    revoke-all-unauthenticated.hurl   DELETE /sessions?all=true        401 auth.unauthenticated
  stream/
    ticket.hurl                       POST   /stream/ticket           200 · needs access_token
    ticket-unauthenticated.hurl       POST   /stream/ticket           401 auth.unauthenticated
  messages/
    policy.hurl                        GET    /messages/policy         200 · public, any state
    list.hurl                          GET    /rooms/:id/messages      200 · needs access_token + room_id
    list-after.hurl                    GET    /rooms/:id/messages?after=  200 · needs access_token + room_id + message_seq
    list-around.hurl                   GET    /rooms/:id/messages?around= 200 · needs access_token + room_id + message_seq
    list-conflicting-params.hurl       GET    /rooms/:id/messages      422 · before and after together
    send-mentions.hurl                 POST   /rooms/:id/messages      201 · needs room.post + target_user_id
    send-mention-invalid.hurl          POST   /rooms/:id/messages      422 message.mention_invalid (dm)
    edit-mentions.hurl                 PATCH  /rooms/:id/messages/:id  200 · needs edit right + message_id
  mentions/
    unread.hurl                        GET    /me/mentions/unread      200 · needs access_token
    unread-unauthenticated.hurl        GET    /me/mentions/unread      401 auth.unauthenticated
    list.hurl                          GET    /me/mentions             200 · needs access_token
    list-invalid.hurl                  GET    /me/mentions             422 · limit below 1
    list-unauthenticated.hurl          GET    /me/mentions             401 auth.unauthenticated
  groups/
    list.hurl                          GET    /rooms/:id/groups                        200 · needs access_token + room_id
    get.hurl                           GET    /rooms/:id/groups/:groupId               200 · needs room_id + group_id
    get-not-found.hurl                 GET    /rooms/:id/groups/:groupId               404 group.not_found
    create.hurl                        POST   /rooms/:id/groups                        201 · needs room.manage_groups
    create-forbidden.hurl              POST   /rooms/:id/groups                        403 room.permission_denied
    create-name-reserved.hurl          POST   /rooms/:id/groups                        422 group.name_reserved
    create-name-taken.hurl             POST   /rooms/:id/groups                        409 group.name_taken
    rename.hurl                        PATCH  /rooms/:id/groups/:groupId               200 · needs room.manage_groups + group_id
    remove.hurl                        DELETE /rooms/:id/groups/:groupId               204 · needs room.manage_groups + group_id
    add-member.hurl                    PUT    /rooms/:id/groups/:groupId/members/:userId    204 · needs group_id + target_user_id
    add-member-not-member.hurl         PUT    /rooms/:id/groups/:groupId/members/:userId    422 group.member_not_member
    remove-member.hurl                 DELETE /rooms/:id/groups/:groupId/members/:userId    204 · needs group_id + target_user_id
  rooms/
    create-space.hurl                  POST   /spaces                  201 · needs owner access_token
    create-space-forbidden.hurl        POST   /spaces                  403 room.permission_denied (non-owner)
    create-channel.hurl                POST   /rooms                   201 · owner + room_id (parent space)
    list.hurl                          GET    /rooms                   200 · needs access_token
    get.hurl                           GET    /rooms/:id               200 · needs access_token + room_id
    get-not-found.hurl                 GET    /rooms/:id               404 room.not_found
    get-forbidden.hurl                 GET    /rooms/:id               403 room.permission_denied (private, non-member)
    preview.hurl                       GET    /rooms/:id/preview       200 · needs access_token + room_id (invite room)
    preview-not-found.hurl             GET    /rooms/:id/preview       404 room.not_found (not an invite room)
    children.hurl                      GET    /rooms/:id/children      200 · needs access_token + room_id
    members.hurl                       GET    /rooms/:id/members       200 · needs access_token + room_id
    update.hurl                        PATCH  /rooms/:id               200 · owner + room_id
    move.hurl                          POST   /rooms/:id/move          200 · owner + room_id + parent_room_id
    move-cycle.hurl                    POST   /rooms/:id/move          422 room.cycle
    delete.hurl                        DELETE /rooms/:id               204 · owner, throwaway empty room
    delete-not-empty.hurl              DELETE /rooms/:id               409 room.not_empty
  permissions/
    my-permissions.hurl                GET    /rooms/:id/my-permissions          200 · needs access_token + room_id
    set-role.hurl                      PUT    /rooms/:id/permissions              204 · owner + room_id
    set-role-forbidden.hurl            PUT    /rooms/:id/permissions              403 room.permission_denied
    set-member.hurl                    PUT    /rooms/:id/members/:userId/permissions 204 · owner + room_id + target_user_id
  retention/
    get.hurl                           GET    /rooms/:id/retention               200 · needs access_token + room_id
    set.hurl                           PUT    /rooms/:id/retention               200 · owner + room_id
    set-forbidden.hurl                 PUT    /rooms/:id/retention               403 room.permission_denied
  moderation/
    log.hurl                           GET    /rooms/:id/moderation-log          200 · needs a moderation capability + room_id
    log-forbidden.hurl                 GET    /rooms/:id/moderation-log          403 room.permission_denied
  membership/
    join.hurl                          POST   /rooms/:id/join                          201 · needs access_token + room_id (public room)
    join-not-joinable.hurl             POST   /rooms/:id/join                          422 room.not_joinable (private room)
    join-banned.hurl                   POST   /rooms/:id/join                          403 room.banned
    leave.hurl                         POST   /rooms/:id/leave                         204 · needs access_token + room_id
    invite.hurl                        POST   /rooms/:id/invitations                   201 · needs room.invite + target_user_id
    invite-forbidden.hurl              POST   /rooms/:id/invitations                   403 room.permission_denied
    list-my-invitations.hurl           GET    /me/room-invitations                     200 · needs access_token (invitee)
    accept-invitation.hurl             POST   /invitations/:id/accept                  201 · needs invitation_id (invitee)
    decline-invitation.hurl            POST   /invitations/:id/decline                 204 · needs invitation_id (invitee)
    join-request.hurl                  POST   /rooms/:id/join-request                  201 · needs access_token + room_id
    list-join-requests.hurl            GET    /rooms/:id/join-requests                 200 · needs room.manage_members + room_id
    list-join-requests-forbidden.hurl  GET    /rooms/:id/join-requests                 403 room.permission_denied
    join-request-approve.hurl          POST   /rooms/:id/join-requests/:id/approve     201 · needs room.manage_members + join_request_id
    join-request-reject.hurl           POST   /rooms/:id/join-requests/:id/reject      204 · needs room.manage_members + join_request_id
    kick.hurl                          DELETE /rooms/:id/members/:userId               204 · needs room.kick + target_user_id
    kick-not-found.hurl                DELETE /rooms/:id/members/:userId               404 room.membership_not_found
    ban.hurl                           POST   /rooms/:id/bans                          204 · needs room.ban + target_user_id
    unban.hurl                         DELETE /rooms/:id/bans/:userId                  204 · needs room.ban + target_user_id
    change-role.hurl                   PATCH  /rooms/:id/members/:userId               200 · needs room.manage_roles + target_user_id
    change-role-above-authority.hurl   PATCH  /rooms/:id/members/:userId               403 room.role_above_authority
```

## Prerequisites

- [Hurl](https://hurl.dev) (`hurl --version`).
- Dev dependencies up: `docker compose up -d` (PostgreSQL on 5432, Mailpit on 1025 / UI 8025).
- `.env` with `DATABASE_URL` and `EKOZ_SECRET_KEY` (32 bytes base64,
  `openssl rand -base64 32`).
- Schema applied: `bun run db:deploy`.
- Server running: `bun run start:dev` (binds `:3010` per `config.toml`).
- `cp http/vars.env.example http/vars.env` and adjust.

## Run

```bash
# one request — its response body prints to stdout
hurl --variables-file http/vars.env http/health/readyz.hurl

# check its assertions
hurl --variables-file http/vars.env --test http/health/readyz.hurl

# the error-path files (green in any state)
hurl --variables-file http/vars.env --test --glob 'http/**/*-unauthenticated.hurl'

# a happy-path chain, threading captured values back into vars.env by hand
hurl --variables-file http/vars.env --test http/auth/login.hurl
hurl --variables-file http/vars.env --test http/sessions/list.hurl

# full request + response (headers and body)
hurl --variables-file http/vars.env --very-verbose http/discovery/well-known.hurl
```

`vars.env` sets `base_url`; override inline with
`--variable base_url=http://ekoz.localhost:3010`.
