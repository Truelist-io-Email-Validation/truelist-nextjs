/**
 * Re-export core types from the truelist SDK and define Next.js-specific config types.
 */

// Re-export types from the truelist SDK
export type {
  ValidationResult,
  ValidationState,
  ValidationSubState,
} from "truelist";

/**
 * Configuration options for server-side email validation.
 */
export type ValidateEmailConfig = {
  /** Your Truelist API key. Defaults to `process.env.TRUELIST_API_KEY`. */
  apiKey?: string;
  /** Base URL for the Truelist API. Defaults to `https://api.truelist.io`. */
  baseUrl?: string;
  /** Treat "risky" emails as invalid. Default: `false`. */
  rejectRisky?: boolean;
};

/**
 * Configuration for the Edge Middleware email validation helper.
 */
export type EmailValidationMiddlewareConfig = {
  /** Route paths to intercept (e.g. `["/api/signup", "/api/contact"]`). */
  paths: string[];
  /** The form field name containing the email. Default: `"email"`. */
  fieldName?: string;
  /** Return 422 for emails with state "invalid". Default: `true`. */
  rejectInvalid?: boolean;
  /** Also reject emails with state "risky". Default: `false`. */
  rejectRisky?: boolean;
  /** Your Truelist API key. Defaults to `process.env.TRUELIST_API_KEY`. */
  apiKey?: string;
  /** Base URL for the Truelist API. Defaults to `https://api.truelist.io`. */
  baseUrl?: string;
};

/**
 * Configuration for the lower-level `validateEmailMiddleware` function.
 */
export type ValidateEmailMiddlewareOptions = {
  /** The form field name containing the email. Default: `"email"`. */
  fieldName?: string;
  /** Your Truelist API key. Defaults to `process.env.TRUELIST_API_KEY`. */
  apiKey?: string;
  /** Base URL for the Truelist API. Defaults to `https://api.truelist.io`. */
  baseUrl?: string;
};

/**
 * The result returned by the `validateEmail` server helper.
 * Extends `ValidationResult` with a convenience `isValid` flag.
 */
export type EmailValidationResult = {
  email: string;
  state: "valid" | "invalid" | "risky" | "unknown";
  subState: string;
  freeEmail: boolean;
  role: boolean;
  disposable: boolean;
  suggestion: string | null;
  /** Convenience flag: `true` when the email passed validation (respects `rejectRisky`). */
  isValid: boolean;
};

/**
 * Error details returned by the middleware when an email is rejected.
 */
export type EmailValidationErrorResponse = {
  error: string;
  details: {
    state: string;
    subState: string;
    suggestion: string | null;
  };
};
