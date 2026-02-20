import { z } from "zod";
import Truelist from "truelist";
import type { ValidationState } from "truelist";

const DEFAULT_API_KEY_ENV = "TRUELIST_API_KEY";

/**
 * Options for the `truelistEmail()` Zod schema.
 */
export type TruelistEmailOptions = {
  /**
   * Which validation states to reject.
   * Default: `["invalid"]`
   *
   * Example: also reject risky emails with `["invalid", "risky"]`.
   */
  rejectStates?: ValidationState[];

  /** Custom error message shown when validation fails. */
  message?: string;

  /** Override the API key (defaults to `process.env.TRUELIST_API_KEY`). */
  apiKey?: string;

  /** Override the API base URL. */
  baseUrl?: string;
};

/**
 * Creates a Zod string schema that validates emails via the Truelist API.
 *
 * Reads the API key from `process.env.TRUELIST_API_KEY` automatically.
 * Uses async refinement, so you must call `parseAsync()`.
 *
 * Designed for use in Server Actions with Zod form validation.
 *
 * @example
 * ```ts
 * import { z } from "zod";
 * import { truelistEmail } from "@truelist/nextjs/zod";
 *
 * const signupSchema = z.object({
 *   email: truelistEmail(),
 *   name: z.string().min(1),
 * });
 *
 * // In your Server Action:
 * export async function signup(formData: FormData) {
 *   const data = await signupSchema.parseAsync({
 *     email: formData.get("email"),
 *     name: formData.get("name"),
 *   });
 *   // data.email is guaranteed valid by Truelist
 * }
 * ```
 *
 * @example Reject risky emails too
 * ```ts
 * const schema = z.object({
 *   email: truelistEmail({ rejectStates: ["invalid", "risky"] }),
 * });
 * ```
 */
export function truelistEmail(options?: TruelistEmailOptions) {
  const {
    rejectStates = ["invalid"],
    message = "This email address is not valid.",
    apiKey: configApiKey,
    baseUrl,
  } = options ?? {};

  const rejectedStates = new Set<string>(rejectStates);

  return z
    .string()
    .email("Please enter a valid email address.")
    .refine(
      async (email) => {
        try {
          const apiKey = configApiKey ?? process.env[DEFAULT_API_KEY_ENV];
          if (!apiKey) {
            throw new Error(
              `Truelist API key is required. Set the ${DEFAULT_API_KEY_ENV} environment variable or pass { apiKey } in options.`
            );
          }

          const client = new Truelist(apiKey, { baseUrl });
          const result = await client.email.validate(email);
          return !rejectedStates.has(result.state);
        } catch {
          // If the API is unavailable, don't block form submission
          return true;
        }
      },
      { message }
    );
}
