/**
 * Wire (payload) types, sourced from `../generated/api` (technical.md §11.3).
 *
 * The generator emits ten Prisma-style variants per schema (`XxxDto`,
 * `XxxDeepDto`, `XxxCreateDto`, …, `XxxSelectDto`) plus a double `Dto` suffix
 * on every name (`LoginResponseDtoDto`). This module is the one place that
 * absorbs both: it re-exports only the flat variant, renamed to drop the
 * duplicate suffix, and re-exports the list-response aliases under the names
 * used by the resource bindings (§10). No field is redeclared — a mismatch
 * with the server is a generated-contract bug, fixed by regenerating, never
 * patched here.
 */

export type {
  AcceptedResponseDtoDto as AcceptedResponse,
  AccountViewDtoDto as AccountView,
  AddOwnerDtoDto as AddOwnerBody,
  AdminCreateUserDtoDto as AdminCreateUserBody,
  AdminUserDetailDtoDto as AdminUserDetail,
  AdminUserListResponseDtoDto as AdminUserListResponse,
  AdminUserListResponseDtoItemsDto as AdminUserListItem,
  AdminUsernameRequestsController_list200ResponseJson as UsernameRequestsListResponse,
  AuthPolicyDtoDto as AuthPolicy,
  AvatarUploadedDtoDto as AvatarUploaded,
  ChangeEmailDtoDto as ChangeEmailBody,
  ChangePasswordDtoDto as ChangePasswordBody,
  ChangeUsernameDtoDto as ChangeUsernameBody,
  ConfirmPasswordResetDtoDto as ConfirmPasswordResetBody,
  CreatedInvitationDtoDto as CreatedInvitation,
  CreateInvitationDtoDto as CreateInvitationBody,
  DeleteMeDtoDto as DeleteMeBody,
  EmailAcceptedResponseDtoDto as EmailAcceptedResponse,
  EmailVerifiedResponseDtoDto as EmailVerifiedResponse,
  InvitationsController_list200ResponseJson as InvitationsListResponse,
  InvitationViewDtoDto as InvitationView,
  LoginDtoDto as LoginBody,
  LoginResponseDtoDto as LoginResponse,
  MeUsernameController_change200ResponseJson as UsernameChangeOutcome,
  MeViewDtoDto as MeView,
  PublicProfileViewDtoDto as PublicProfileView,
  RegisterDtoDto as RegisterBody,
  RenameSessionDtoDto as RenameSessionBody,
  RequestPasswordResetDtoDto as RequestPasswordResetBody,
  ResendVerificationDtoDto as ResendVerificationBody,
  RevokeAllSessionsResponseDtoDto as RevokeAllSessionsResponse,
  SessionsController_list200ResponseJson as SessionsListResponse,
  SessionViewDtoDto as SessionView,
  SetupOwnerDtoDto as SetupOwnerBody,
  SetupOwnerResponseDtoDto as SetupOwnerResponse,
  SetupStateDtoDto as SetupStateResponse,
  SuspendUserDtoDto as SuspendUserBody,
  TokenBundleDtoDto as TokenBundle,
  UpdateProfileDtoDto as UpdateProfileBody,
  UsernameApprovedDtoDto as UsernameApproved,
  UsernameChangeAppliedDtoDto as UsernameChangeApplied,
  UsernameChangePendingDtoDto as UsernameChangePending,
  UsernameChangeRequestDtoDto as UsernameChangeRequest,
  UsernameChangeStateDtoDto as UsernameChangeState,
  UsernameChangeStateDtoPendingRequestDto as UsernameChangePendingRequest,
  VerifyEmailDtoDto as VerifyEmailBody,
} from '../generated/api/index.js';
