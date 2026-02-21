/**
 * Route Handler helpers for validating email fields in form submissions.
 *
 * Uses raw `fetch` (no Node.js-specific APIs) so it stays Edge-compatible
 * if used inside an Edge Route Handler.
 *
 * Calls the `POST /api/v1/verify_inline?email=...` endpoint.
 */

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import type {
  EmailValidationHandlerConfig,
  ValidateFormSubmissionOptions,
  EmailValidationErrorResponse,
} from "./types";
import { AuthenticationError } from "truelist";
import type { ValidationResult, ValidationState, ValidationSubState } from "truelist";

const DEFAULT_BASE_URL = "https://api.truelist.io";
const DEFAULT_FIELD_NAME = "email";
const DEFAULT_API_KEY_ENV = "TRUELIST_API_KEY";
const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_REJECT_STATES: ValidationState[] = ["email_invalid"];

/**
 * Raw API response from the verify_inline endpoint.
 * Defined here to avoid importing Node-only modules in Edge Runtime.
 */
type ApiValidationEmail = {
  address: string;
  domain: string;
  canonical: string;
  mx_record: string | null;
  first_name: string | null;
  last_name: string | null;
  email_state: ValidationState;
  email_sub_state: ValidationSubState;
  verified_at: string;
  did_you_mean: string | null;
};

type ApiValidationResponse = {
  emails: ApiValidationEmail[];
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
 * Call the Truelist verify_inline endpoint using raw fetch (Edge-compatible).
 * Includes an AbortController timeout to prevent hanging requests.
 */
async function verifyInline(
  email: string,
  apiKey: string,
  baseUrl: string,
  timeoutMs: number
): Promise<ValidationResult> {
  const queryParam = encodeURIComponent(email);
  const url = `${baseUrl}/api/v1/verify_inline?email=${queryParam}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
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

    const data: ApiValidationResponse =
      (await response.json()) as ApiValidationResponse;

    const entry = data.emails[0];
    return {
      email: entry.address,
      domain: entry.domain,
      canonical: entry.canonical,
      mxRecord: entry.mx_record,
      firstName: entry.first_name,
      lastName: entry.last_name,
      state: entry.email_state,
      subState: entry.email_sub_state,
      verifiedAt: entry.verified_at,
      suggestion: entry.did_you_mean,
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
 *   if (result?.state === "email_invalid") {
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

  return verifyInline(email, apiKey, baseUrl, timeoutMs);
}

/**
 * Create a Next.js Route Handler (POST) that validates email fields
 * in requests to matching paths.
 *
 * Emails with rejected states receive a 422 JSON response.
 * Other emails pass through to the next handler via `NextResponse.next()`.
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
 *   rejectStates: ["email_invalid"],
 * });
 *
 * export async function POST(request: NextRequest) {
 *   const blocked = await validate(request);
 *   if (blocked) return blocked; // 422 response
 *
 *   // Email is valid -- continue with your logic
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
    rejectStates = DEFAULT_REJECT_STATES,
    apiKey: configApiKey,
    baseUrl: configBaseUrl,
    timeout: configTimeout,
  } = config;

  const rejectedStates = new Set<string>(rejectStates);

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

    // No email found in the request body -- pass through
    if (!email) {
      return null;
    }

    try {
      const result = await verifyInline(email, apiKey, baseUrl, timeoutMs);

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
