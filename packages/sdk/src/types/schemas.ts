/**
 * Zod validation schemas for the wire (payload) types in `./wire.ts`, sourced
 * from `../generated/api/zod-api` (technical.md §11.2).
 *
 * `zodGenerator` emits the same ten Prisma-style variants per schema as
 * `typescriptGenerator` does for `wire.ts`, but only a single `Dto` suffix on
 * each const (`LoginResponseDtoSchema`, not `LoginResponseDtoDtoSchema`) since
 * the generated type name — not the schema const — is what carries the
 * duplicate suffix. This module re-exports only the flat variant, one schema
 * per `wire.ts` export, named `<WireTypeName>Schema` so `zodResolver` call
 * sites pair a form's type with its schema by name
 * (`useForm<AdminCreateUserBody>({ resolver: zodResolver(AdminCreateUserBodySchema) })`).
 * No field is redeclared — a mismatch with the server is a generated-contract
 * bug, fixed by regenerating, never patched here.
 */

export {
  AcceptedResponseDtoSchema as AcceptedResponseSchema,
  AccountViewDtoSchema as AccountViewSchema,
  AddOwnerDtoSchema as AddOwnerBodySchema,
  AdminCreateUserDtoSchema as AdminCreateUserBodySchema,
  AdminUserDetailDtoSchema as AdminUserDetailSchema,
  AdminUserListResponseDtoItemsSchema as AdminUserListItemSchema,
  AdminUserListResponseDtoSchema as AdminUserListResponseSchema,
  AdminUsernameRequestsController_list200ResponseJsonSchema as UsernameRequestsListResponseSchema,
  AuthPolicyDtoSchema as AuthPolicySchema,
  AvatarUploadedDtoSchema as AvatarUploadedSchema,
  ChangeEmailDtoSchema as ChangeEmailBodySchema,
  ChangePasswordDtoSchema as ChangePasswordBodySchema,
  ChangeUsernameDtoSchema as ChangeUsernameBodySchema,
  ConfirmPasswordResetDtoSchema as ConfirmPasswordResetBodySchema,
  CreatedInvitationDtoSchema as CreatedInvitationSchema,
  CreateInvitationDtoSchema as CreateInvitationBodySchema,
  DeleteMeDtoSchema as DeleteMeBodySchema,
  EmailAcceptedResponseDtoSchema as EmailAcceptedResponseSchema,
  EmailVerifiedResponseDtoSchema as EmailVerifiedResponseSchema,
  InvitationsController_list200ResponseJsonSchema as InvitationsListResponseSchema,
  InvitationViewDtoSchema as InvitationViewSchema,
  LoginDtoSchema as LoginBodySchema,
  LoginResponseDtoSchema as LoginResponseSchema,
  MemberListViewDtoItemsSchema as MemberSchema,
  MemberListViewDtoSchema as MembersPageSchema,
  MessagePageDtoSchema as MessagesPageSchema,
  MessageViewDtoSchema as MessageSchema,
  MeUsernameController_change200ResponseJsonSchema as UsernameChangeOutcomeSchema,
  MeViewDtoSchema as MeViewSchema,
  PublicProfileViewDtoSchema as PublicProfileViewSchema,
  RegisterDtoSchema as RegisterBodySchema,
  RenameSessionDtoSchema as RenameSessionBodySchema,
  RequestPasswordResetDtoSchema as RequestPasswordResetBodySchema,
  ResendVerificationDtoSchema as ResendVerificationBodySchema,
  RevokeAllSessionsResponseDtoSchema as RevokeAllSessionsResponseSchema,
  SessionsController_list200ResponseJsonSchema as SessionsListResponseSchema,
  SessionViewDtoSchema as SessionViewSchema,
  SetupOwnerDtoSchema as SetupOwnerBodySchema,
  SetupOwnerResponseDtoSchema as SetupOwnerResponseSchema,
  SetupStateDtoSchema as SetupStateResponseSchema,
  StreamTicketResponseDtoSchema as StreamTicketSchema,
  SuspendUserDtoSchema as SuspendUserBodySchema,
  TokenBundleDtoSchema as TokenBundleSchema,
  UpdateProfileDtoSchema as UpdateProfileBodySchema,
  UsernameApprovedDtoSchema as UsernameApprovedSchema,
  UsernameChangeAppliedDtoSchema as UsernameChangeAppliedSchema,
  UsernameChangePendingDtoSchema as UsernameChangePendingSchema,
  UsernameChangeRequestDtoSchema as UsernameChangeRequestSchema,
  UsernameChangeStateDtoPendingRequestSchema as UsernameChangePendingRequestSchema,
  UsernameChangeStateDtoSchema as UsernameChangeStateSchema,
  VerifyEmailDtoSchema as VerifyEmailBodySchema,
} from '../generated/api/zod-api/index.js';
