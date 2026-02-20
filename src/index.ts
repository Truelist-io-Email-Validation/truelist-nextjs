// Server Action helpers
export { validateEmail, createEmailValidator } from "./server";

// Middleware helpers
export { withEmailValidation, validateEmailMiddleware } from "./middleware";

// Zod integration
export { truelistEmail } from "./zod";

// Types
export type {
  ValidateEmailConfig,
  EmailValidationMiddlewareConfig,
  ValidateEmailMiddlewareOptions,
  EmailValidationResult,
  EmailValidationErrorResponse,
} from "./types";

// Re-export core types from truelist SDK
export type {
  ValidationResult,
  ValidationState,
  ValidationSubState,
} from "truelist";
