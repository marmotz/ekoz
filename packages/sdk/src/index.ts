/**
 * `@ekoz/sdk` public surface.
 *
 * This increment ships the transport core and discovery primitives; the
 * `createClient` assembly, session manager and resource bindings land in later
 * tasks.
 */

export {
  Discovery,
  type DiscoveryDocument,
  type DiscoveryOptions,
  SUPPORTED_PROTOCOL_MAJORS,
  WELL_KNOWN_PATH,
} from './discovery/discovery.js';
export {
  AccountSuspendedError,
  AuthenticationError,
  EkozError,
  type EkozErrorInit,
  EmailNotVerifiedError,
  EmailTakenError,
  InvalidCredentialsError,
  InvitationInvalidError,
  LastOwnerError,
  NetworkError,
  NotFoundError,
  type ProblemDetails,
  ProtocolMismatchError,
  RateLimitError,
  RefreshInvalidError,
  RefreshReuseError,
  RegistrationClosedError,
  ServerError,
  UsernameChangeCooldownError,
  UsernameImmutableError,
  UsernameTakenError,
  ValidationError,
  type ValidationIssue,
  WeakPasswordError,
} from './transport/errors.js';
export {
  DEFAULT_PROTOCOL_VERSION,
  HttpClient,
  type HttpClientOptions,
  type HttpMethod,
  PROTOCOL_HEADER,
  type QueryValue,
  type RequestOptions,
} from './transport/http-client.js';
export {
  decodeProblem,
  ERROR_CODE_MAP,
  parseRetryAfter,
  toNetworkError,
} from './transport/problem.js';
export {
  newRequestId,
  REQUEST_ID_HEADER,
  resolveRequestId,
} from './transport/request-context.js';
