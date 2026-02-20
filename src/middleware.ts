/**
 * Route Handler helpers for validating email fields in form submissions.
 *
 * Uses raw `fetch` (no Node.js-specific APIs) so it stays Edge-compatible
 * if used inside an Edge Route Handler.
 *
 * Calls the `/api/v1/form_verify` endpoint (60 req/min rate limit).
 */

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import type {
  EmailValidationHandlerConfig,
  ValidateFormSubmissionOptions,
  EmailValidationErrorResponse,
} from "./types";
import { AuthenticationError } from "truelist";
import type { ValidationResult, ValidationSubState } from "truelist";

const DEFAULT_BASE_URL = "https://api.truelist.io";
const DEFAULT_FIELD_NAME = "email";
const DEFAULT_API_KEY_ENV = "TRUELIST_API_KEY";
const DEFAULT_TIMEOUT_MS = 10_000;

/**
 * Raw API response from the form_verify endpoint.
 * Defined here to avoid importing Node-only modules in Edge Runtime.
 */
type ApiFormVerifyResponse = {
  email: string;
  state: "valid" | "invalid" | "risky" | "unknown";
  sub_state: ValidationSubState;
  free_email: boolean;
  role: boolean;
  disposable: boolean;
  suggestion: string | null;
};

function getApiKey(configApiKey?: string): string {
  const key = configApiKey ?? process.env[DEFAULT_API_KEY_ENV];
  if (!key) {
    throw new Error(
      `Truelist API key is required. Set the ${DEFAULT_API_KEY_ENV} environment variable or pass { apiKey } in config.`
    );
  }
  return key;
}

/**
 * Call the Truelist form_verify endpoint using raw fetch (Edge-compatible).
 * Includes an AbortController timeout to prevent hanging requests.
 */
async function formVerify(
  email: string,
  apiKey: string,
  baseUrl: string,
  timeoutMs: number
): Promise<ValidationResult> {
  const url = `${baseUrl}/api/v1/form_verify`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ email }),
      signal: controller.signal,
    });

    if (!response.ok) {
      if (response.status === 401) {
        throw new AuthenticationError();
      }
      const text = await response.text().catch(() => "");
      throw new Error(
        `Truelist API error: ${response.status} ${response.statusText}${text ? ` - ${text}` : ""}`
      );
    }

    const data: ApiFormVerifyResponse =
      (await response.json()) as ApiFormVerifyResponse;

    return {
      email: data.email,
      state: data.state,
      subState: data.sub_state,
      freeEmail: data.free_email,
      role: data.role,
      disposable: data.disposable,
      suggestion: data.suggestion,
    };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Extract the email from a request body (JSON or FormData).
 */
async function extractEmail(
  request: Request,
  fieldName: string
): Promise<string | null> {
  const contentType = request.headers.get("content-type") ?? "";

  if (contentType.includes("application/json")) {
    try {
      const body = (await request.json()) as Record<string, unknown>;
      const value = body[fieldName];
      return typeof value === "string" ? value : null;
    } catch {
      return null;
    }
  }

  if (
    contentType.includes("multipart/form-data") ||
    contentType.includes("application/x-www-form-urlencoded")
  ) {
    try {
      const formData = await request.formData();
      const value = formData.get(fieldName);
      return typeof value === "string" ? value : null;
    } catch {
      return null;
    }
  }

  return null;
}

/**
 * Validate an email from a Request body and return the `ValidationResult`
 * (or `null` if no email was found).
 *
 * Works in both Node.js and Edge Route Handlers.
 *
 * @example
 * ```ts
 * // app/api/signup/route.ts
 * import { validateFormSubmission } from "@truelist/nextjs/middleware";
 * import { NextResponse } from "next/server";
 * import type { NextRequest } from "next/server";
 *
 * export async function POST(request: NextRequest) {
 *   const result = await validateFormSubmission(request, { fieldName: "email" });
 *
 *   if (result?.state === "invalid") {
 *     return NextResponse.json(
 *       { error: "Invalid email" },
 *       { status: 422 }
 *     );
 *   }
 *
 *   // Continue processing the form...
 *   return NextResponse.json({ success: true });
 * }
 * ```
 */
export async function validateFormSubmission(
  request: Request,
  options?: ValidateFormSubmissionOptions
): Promise<ValidationResult | null> {
  const fieldName = options?.fieldName ?? DEFAULT_FIELD_NAME;
  const apiKey = getApiKey(options?.apiKey);
  const baseUrl = (options?.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, "");
  const timeoutMs = options?.timeout ?? DEFAULT_TIMEOUT_MS;

  const email = await extractEmail(request, fieldName);
  if (!email) {
    return null;
  }

  return formVerify(email, apiKey, baseUrl, timeoutMs);
}

/**
 * Create a Next.js Route Handler (POST) that validates email fields
 * in requests to matching paths.
 *
 * Invalid emails receive a 422 JSON response. Valid/risky/unknown emails
 * pass through to the next handler via `NextResponse.next()`.
 *
 * Uses `pathname.startsWith()` for path matching so nested routes are covered.
 *
 * @example
 * ```ts
 * // app/api/signup/route.ts
 * import { createValidationHandler } from "@truelist/nextjs/middleware";
 * import { NextResponse } from "next/server";
 * import type { NextRequest } from "next/server";
 *
 * const validate = createValidationHandler({
 *   paths: ["/api/signup"],
 *   rejectInvalid: true,
 *   rejectRisky: false,
 * });
 *
 * export async function POST(request: NextRequest) {
 *   const blocked = await validate(request);
 *   if (blocked) return blocked; // 422 response
 *
 *   // Email is valid — continue with your logic
 *   const body = await request.json();
 *   return NextResponse.json({ success: true });
 * }
 * ```
 */
export function createValidationHandler(
  config: EmailValidationHandlerConfig
): (request: NextRequest) => Promise<NextResponse | null> {
  const {
    paths,
    fieldName = DEFAULT_FIELD_NAME,
    rejectInvalid = true,
    rejectRisky = false,
    apiKey: configApiKey,
    baseUrl: configBaseUrl,
    timeout: configTimeout,
  } = config;

  return async (request: NextRequest): Promise<NextResponse | null> => {
    // Only validate if the pathname matches one of the configured paths
    const pathname = request.nextUrl.pathname;
    const matches = paths.some((path) => pathname.startsWith(path));
    if (!matches) {
      return null;
    }

    const apiKey = getApiKey(configApiKey);
    const baseUrl = (configBaseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, "");
    const timeoutMs = configTimeout ?? DEFAULT_TIMEOUT_MS;

    const email = await extractEmail(request, fieldName);

    // No email found in the request body — pass through
    if (!email) {
      return null;
    }

    try {
      const result = await formVerify(email, apiKey, baseUrl, timeoutMs);

      const rejectedStates = new Set<string>();
      if (rejectInvalid) rejectedStates.add("invalid");
      if (rejectRisky) rejectedStates.add("risky");

      if (rejectedStates.has(result.state)) {
        const errorBody: EmailValidationErrorResponse = {
          error: "Invalid email",
          details: {
            state: result.state,
            subState: result.subState,
            suggestion: result.suggestion,
          },
        };

        return NextResponse.json(errorBody, { status: 422 });
      }

      // Email passed validation
      return null;
    } catch (error) {
      if (error instanceof AuthenticationError) {
        throw error;
      }
      // If the Truelist API is unreachable or timed out, don't block the request
      return null;
    }
  };
}
