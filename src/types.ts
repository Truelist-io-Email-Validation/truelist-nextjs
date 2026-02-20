/**
 * Re-export core types from the truelist SDK and define Next.js-specific config types.
 */

// Re-export types from the truelist SDK
export type {
  ValidationResult,
  ValidationState,
  ValidationSubState,
} from "truelist";

import type { ValidationState, ValidationSubState } from "truelist";

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
 * Configuration for the Route Handler email validation helper.
 */
export type EmailValidationHandlerConfig = {
  /** Route path prefixes to validate (e.g. `["/api/signup", "/api/contact"]`). */
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
  /** Timeout in milliseconds for the API call. Default: `10000` (10s). */
  timeout?: number;
};

/**
 * Configuration for the lower-level `validateFormSubmission` function.
 */
export type ValidateFormSubmissionOptions = {
  /** The form field name containing the email. Default: `"email"`. */
  fieldName?: string;
  /** Your Truelist API key. Defaults to `process.env.TRUELIST_API_KEY`. */
  apiKey?: string;
  /** Base URL for the Truelist API. Defaults to `https://api.truelist.io`. */
  baseUrl?: string;
  /** Timeout in milliseconds for the API call. Default: `10000` (10s). */
  timeout?: number;
};

/**
 * The result returned by the `validateEmail` server helper.
 * Extends the core SDK's `ValidationResult` with a convenience `isValid` flag.
 */
export type EmailValidationResult = {
  email: string;
  state: ValidationState;
  subState: ValidationSubState;
  freeEmail: boolean;
  role: boolean;
  disposable: boolean;
  suggestion: string | null;
  /** Convenience flag: `true` when the email passed validation (respects `rejectRisky`). */
  isValid: boolean;
};

/**
 * Error details returned by the route handler when an email is rejected.
 */
export type EmailValidationErrorResponse = {
  error: string;
  details: {
    state: string;
    subState: string;
    suggestion: string | null;
  };
};
