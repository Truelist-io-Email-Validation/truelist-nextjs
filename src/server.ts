import Truelist from "truelist";
import type { ValidateEmailConfig, EmailValidationResult } from "./types";

const DEFAULT_API_KEY_ENV = "TRUELIST_API_KEY";

function getApiKey(config?: ValidateEmailConfig): string {
  const key = config?.apiKey ?? process.env[DEFAULT_API_KEY_ENV];
  if (!key) {
    throw new Error(
      `Truelist API key is required. Set the ${DEFAULT_API_KEY_ENV} environment variable or pass { apiKey } in config.`
    );
  }
  return key;
}

/**
 * Validate an email address using the Truelist server-side API (`/api/v1/verify`).
 *
 * Reads the API key from `process.env.TRUELIST_API_KEY` by default.
 * Returns an `EmailValidationResult` with a convenience `isValid` flag.
 *
 * Designed for use inside Next.js Server Actions and Route Handlers.
 *
 * @example
 * ```ts
 * "use server";
 * import { validateEmail } from "@truelist/nextjs/server";
 *
 * export async function checkEmail(email: string) {
 *   const result = await validateEmail(email);
 *   if (!result.isValid) {
 *     return { error: "Invalid email", suggestion: result.suggestion };
 *   }
 *   return { success: true };
 * }
 * ```
 */
export async function validateEmail(
  email: string,
  config?: ValidateEmailConfig
): Promise<EmailValidationResult> {
  const apiKey = getApiKey(config);
  const client = new Truelist(apiKey, {
    baseUrl: config?.baseUrl,
  });

  const result = await client.email.validate(email);
  const rejectRisky = config?.rejectRisky ?? false;

  const rejectedStates = new Set<string>(["invalid"]);
  if (rejectRisky) {
    rejectedStates.add("risky");
  }

  return {
    email: result.email,
    state: result.state,
    subState: result.subState,
    freeEmail: result.freeEmail,
    role: result.role,
    disposable: result.disposable,
    suggestion: result.suggestion,
    isValid: !rejectedStates.has(result.state),
  };
}

/**
 * Create a pre-configured email validator function.
 *
 * Useful when you want to set `rejectRisky`, a custom API key, or other
 * options once and reuse the validator across multiple Server Actions.
 *
 * @example
 * ```ts
 * import { createEmailValidator } from "@truelist/nextjs/server";
 *
 * const validate = createEmailValidator({
 *   rejectRisky: true,
 * });
 *
 * // In a Server Action:
 * export async function signup(formData: FormData) {
 *   const result = await validate(formData.get("email") as string);
 *   if (!result.isValid) {
 *     return { error: "Please use a valid email address" };
 *   }
 * }
 * ```
 */
export function createEmailValidator(
  config: ValidateEmailConfig
): (email: string) => Promise<EmailValidationResult> {
  return (email: string) => validateEmail(email, config);
}
