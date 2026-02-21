/**
 * Re-export core types from the truelist SDK and define Next.js-specific config types.
 */

// Re-export types from the truelist SDK
export type {
  ValidationResult,
  ValidationState,
  ValidationSubState,
} from "truelist";

import type { ValidationState } from "truelist";

/**
 * Configuration options for server-side email validation.
 */
export type ValidateEmailConfig = {
  /** Your Truelist API key. Defaults to `process.env.TRUELIST_API_KEY`. */
  apiKey?: string;
  /** Base URL for the Truelist API. Defaults to `https://api.truelist.io`. */
  baseUrl?: string;
  /**
   * Which validation states to reject (mark as invalid).
   * Default: `["email_invalid"]`
   */
  rejectStates?: ValidationState[];
};

/**
 * Configuration for the Route Handler email validation helper.
 */
export type EmailValidationHandlerConfig = {
  /** Route path prefixes to validate (e.g. `["/api/signup", "/api/contact"]`). */
  paths: string[];
  /** The form field name containing the email. Default: `"email"`. */
  fieldName?: string;
  /**
   * Which validation states to reject with a 422 response.
   * Default: `["email_invalid"]`
   */
  rejectStates?: ValidationState[];
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
 * Extends the core SDK's `ValidationResult` with convenience methods.
 */
export type EmailValidationResult = {
  email: string;
  domain: string;
  canonical: string;
  mxRecord: string | null;
  firstName: string | null;
  lastName: string | null;
  state: ValidationState;
  subState: string;
  verifiedAt: string;
  suggestion: string | null;
  /** Convenience: `true` when `state === "ok"`. */
  isValid: boolean;
  /** Convenience: `true` when `state === "email_invalid"`. */
  isInvalid: boolean;
  /** Convenience: `true` when `subState === "is_disposable"`. */
  isDisposable: boolean;
  /** Convenience: `true` when `subState === "is_role"`. */
  isRole: boolean;
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
