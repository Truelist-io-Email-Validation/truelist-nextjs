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
 * Validate an email address using the Truelist server-side API (`POST /api/v1/verify_inline`).
 *
 * Reads the API key from `process.env.TRUELIST_API_KEY` by default.
 * Returns an `EmailValidationResult` with convenience flags.
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
  const rejectStates = new Set<string>(
    config?.rejectStates ?? ["email_invalid"]
  );

  return {
    email: result.email,
    domain: result.domain,
    canonical: result.canonical,
    mxRecord: result.mxRecord,
    firstName: result.firstName,
    lastName: result.lastName,
    state: result.state,
    subState: result.subState,
    verifiedAt: result.verifiedAt,
    suggestion: result.suggestion,
    isValid: !rejectStates.has(result.state),
    isInvalid: result.state === "email_invalid",
    isDisposable: result.subState === "is_disposable",
    isRole: result.subState === "is_role",
  };
}

/**
 * Create a pre-configured email validator function.
 *
 * Useful when you want to set `rejectStates`, a custom API key, or other
 * options once and reuse the validator across multiple Server Actions.
 *
 * @example
 * ```ts
 * import { createEmailValidator } from "@truelist/nextjs/server";
 *
 * const validate = createEmailValidator({
 *   rejectStates: ["email_invalid", "risky"],
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
