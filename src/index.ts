/**
 * `@ekoz/sdk` public surface.
 *
 * This increment ships the transport core and discovery primitives; the
 * `createClient` assembly, session manager and resource bindings land in later
 * tasks.
 */

export {
  DEFAULT_PROTOCOL_VERSION,
  HttpClient,
  PROTOCOL_HEADER,
  type HttpClientOptions,
  type HttpMethod,
  type QueryValue,
  type RequestOptions,
} from "./transport/http-client.js";

export {
  ERROR_CODE_MAP,
  decodeProblem,
  parseRetryAfter,
  toNetworkError,
} from "./transport/problem.js";

export {
  REQUEST_ID_HEADER,
  newRequestId,
  resolveRequestId,
} from "./transport/request-context.js";

export {
  Discovery,
  SUPPORTED_PROTOCOL_MAJORS,
  WELL_KNOWN_PATH,
  type DiscoveryDocument,
  type DiscoveryOptions,
} from "./discovery/discovery.js";

export {
  AccountSuspendedError,
  AuthenticationError,
  EkozError,
  EmailNotVerifiedError,
  EmailTakenError,
  InvalidCredentialsError,
  InvitationInvalidError,
  LastOwnerError,
  NetworkError,
  NotFoundError,
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
  WeakPasswordError,
  type EkozErrorInit,
  type ProblemDetails,
  type ValidationIssue,
} from "./transport/errors.js";
