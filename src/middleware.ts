/**
 * Edge Middleware helpers for validating email fields in form submissions.
 *
 * Uses raw `fetch` (no Node.js-specific APIs) so it works in the Edge Runtime.
 * Calls the `/api/v1/form_verify` endpoint (60 req/min rate limit).
 */

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import type {
  EmailValidationMiddlewareConfig,
  ValidateEmailMiddlewareOptions,
  EmailValidationErrorResponse,
} from "./types";
import type { ValidationResult, ValidationSubState } from "truelist";

const DEFAULT_BASE_URL = "https://api.truelist.io";
const DEFAULT_FIELD_NAME = "email";
const DEFAULT_API_KEY_ENV = "TRUELIST_API_KEY";

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
 */
async function formVerify(
  email: string,
  apiKey: string,
  baseUrl: string
): Promise<ValidationResult> {
  const url = `${baseUrl}/api/v1/form_verify`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ email }),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(
      `Truelist API error: ${response.status} ${response.statusText}${text ? ` - ${text}` : ""}`
    );
  }

  const data: ApiFormVerifyResponse = await response.json() as ApiFormVerifyResponse;

  return {
    email: data.email,
    state: data.state,
    subState: data.sub_state,
    freeEmail: data.free_email,
    role: data.role,
    disposable: data.disposable,
    suggestion: data.suggestion,
  };
}

/**
 * Extract the email from a cloned request body (JSON or FormData).
 */
async function extractEmail(
  request: NextRequest,
  fieldName: string
): Promise<string | null> {
  const contentType = request.headers.get("content-type") ?? "";

  if (contentType.includes("application/json")) {
    try {
      const body = await request.json() as Record<string, unknown>;
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
 * Lower-level middleware helper that validates an email from the request
 * and returns the `ValidationResult` (or `null` if no email was found).
 *
 * Use this when you want full control over the response.
 *
 * @example
 * ```ts
 * import { validateEmailMiddleware } from "@truelist/nextjs/middleware";
 * import { NextResponse } from "next/server";
 * import type { NextRequest } from "next/server";
 *
 * export async function middleware(request: NextRequest) {
 *   const result = await validateEmailMiddleware(request, { fieldName: "email" });
 *
 *   if (result?.state === "invalid") {
 *     return NextResponse.json(
 *       { error: "Invalid email" },
 *       { status: 422 }
 *     );
 *   }
 *
 *   return NextResponse.next();
 * }
 *
 * export const config = {
 *   matcher: ["/api/signup", "/api/contact"],
 * };
 * ```
 */
export async function validateEmailMiddleware(
  request: NextRequest,
  options?: ValidateEmailMiddlewareOptions
): Promise<ValidationResult | null> {
  const fieldName = options?.fieldName ?? DEFAULT_FIELD_NAME;
  const apiKey = getApiKey(options?.apiKey);
  const baseUrl = (options?.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, "");

  const email = await extractEmail(request, fieldName);
  if (!email) {
    return null;
  }

  return formVerify(email, apiKey, baseUrl);
}

/**
 * Create a complete Next.js Edge Middleware that validates email fields
 * in POST requests to the specified paths.
 *
 * Invalid emails receive a 422 JSON response. Valid/risky/unknown emails
 * pass through to the next handler.
 *
 * @example
 * ```ts
 * // middleware.ts
 * import { withEmailValidation } from "@truelist/nextjs/middleware";
 *
 * export default withEmailValidation({
 *   paths: ["/api/signup", "/api/contact"],
 *   fieldName: "email",
 *   rejectInvalid: true,
 *   rejectRisky: false,
 * });
 *
 * export const config = {
 *   matcher: ["/api/signup", "/api/contact"],
 * };
 * ```
 */
export function withEmailValidation(
  config: EmailValidationMiddlewareConfig
): (request: NextRequest) => Promise<NextResponse> {
  const {
    paths,
    fieldName = DEFAULT_FIELD_NAME,
    rejectInvalid = true,
    rejectRisky = false,
    apiKey: configApiKey,
    baseUrl: configBaseUrl,
  } = config;

  const pathSet = new Set(paths);

  return async (request: NextRequest): Promise<NextResponse> => {
    // Only intercept POST requests to specified paths
    if (request.method !== "POST" || !pathSet.has(request.nextUrl.pathname)) {
      return NextResponse.next();
    }

    const apiKey = getApiKey(configApiKey);
    const baseUrl = (configBaseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, "");

    const email = await extractEmail(request, fieldName);

    // No email found in the request body — pass through
    if (!email) {
      return NextResponse.next();
    }

    try {
      const result = await formVerify(email, apiKey, baseUrl);

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

      return NextResponse.next();
    } catch {
      // If the Truelist API is unreachable, don't block the request
      return NextResponse.next();
    }
  };
}
