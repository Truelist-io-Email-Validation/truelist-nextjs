// Server Action helpers
export { validateEmail, createEmailValidator } from "./server";

// Route Handler helpers
export { createValidationHandler, validateFormSubmission } from "./middleware";

// Zod integration
export { truelistEmail } from "./zod";

// Types
export type {
  ValidateEmailConfig,
  EmailValidationHandlerConfig,
  ValidateFormSubmissionOptions,
  EmailValidationResult,
  EmailValidationErrorResponse,
} from "./types";

// Re-export core types from truelist SDK
export type {
  ValidationResult,
  ValidationState,
  ValidationSubState,
} from "truelist";
