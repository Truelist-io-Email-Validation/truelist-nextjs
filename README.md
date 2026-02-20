# @truelist/nextjs

Email validation for Next.js -- Server Actions, Edge Middleware, and Zod integration powered by [Truelist.io](https://truelist.io).

[![npm version](https://img.shields.io/npm/v/@truelist/nextjs.svg)](https://www.npmjs.com/package/@truelist/nextjs)
[![CI](https://github.com/Truelist-io-Email-Validation/truelist-nextjs/actions/workflows/ci.yml/badge.svg)](https://github.com/Truelist-io-Email-Validation/truelist-nextjs/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)

## Install

```bash
npm install @truelist/nextjs
```

Set your API key in `.env.local`:

```env
TRUELIST_API_KEY=your-api-key
```

## Quick Start with Server Actions

```ts
"use server";

import { validateEmail } from "@truelist/nextjs/server";

export async function checkEmail(formData: FormData) {
  const result = await validateEmail(formData.get("email") as string);

  if (!result.isValid) {
    return { error: "Invalid email", suggestion: result.suggestion };
  }

  return { success: true };
}
```

## Server Action Helpers

### `validateEmail(email, config?)`

Validate a single email address using the Truelist server-side API (`POST /api/v1/verify`, 10 req/s).

```ts
import { validateEmail } from "@truelist/nextjs/server";

const result = await validateEmail("user@example.com");

result.state;      // "valid" | "invalid" | "risky" | "unknown"
result.subState;   // "ok" | "disposable_address" | "role_address" | ...
result.freeEmail;  // true
result.role;       // false
result.disposable; // false
result.suggestion; // null or "user@gmail.com"
result.isValid;    // true (convenience flag respecting rejectRisky)
```

#### Options

```ts
const result = await validateEmail("user@example.com", {
  apiKey: "custom-key",      // Override env var
  baseUrl: "https://...",    // Custom API URL
  rejectRisky: true,         // Treat "risky" as invalid
});
```

### `createEmailValidator(config)`

Create a pre-configured validator for reuse across multiple Server Actions.

```ts
import { createEmailValidator } from "@truelist/nextjs/server";

const validate = createEmailValidator({
  rejectRisky: true,
});

// Use in any Server Action:
export async function signup(formData: FormData) {
  const result = await validate(formData.get("email") as string);
  if (!result.isValid) {
    return { error: "Please use a valid email address" };
  }
  // proceed...
}
```

## Edge Middleware

Validate email fields in form submissions at the edge before they reach your route handlers.

### `withEmailValidation(config)`

Creates a complete middleware function that intercepts POST requests and validates email fields.

```ts
// middleware.ts
import { withEmailValidation } from "@truelist/nextjs/middleware";

export default withEmailValidation({
  paths: ["/api/signup", "/api/contact"],
  fieldName: "email",        // default
  rejectInvalid: true,       // return 422 for invalid emails (default)
  rejectRisky: false,        // also reject risky emails (default: false)
});

export const config = {
  matcher: ["/api/signup", "/api/contact"],
};
```

When an invalid email is detected, the middleware returns:

```json
{
  "error": "Invalid email",
  "details": {
    "state": "invalid",
    "subState": "failed_no_mailbox",
    "suggestion": null
  }
}
```

with HTTP status `422 Unprocessable Entity`.

Valid, risky (unless `rejectRisky: true`), and unknown emails pass through to your route handler.

### `validateEmailMiddleware(request, options?)`

Lower-level helper for custom middleware logic. Returns the `ValidationResult` or `null`.

```ts
// middleware.ts
import { validateEmailMiddleware } from "@truelist/nextjs/middleware";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export async function middleware(request: NextRequest) {
  const result = await validateEmailMiddleware(request, {
    fieldName: "email",
  });

  if (result?.state === "invalid") {
    return NextResponse.json(
      { error: "Invalid email", suggestion: result.suggestion },
      { status: 422 }
    );
  }

  if (result?.state === "risky" && result.disposable) {
    return NextResponse.json(
      { error: "Disposable emails are not allowed" },
      { status: 422 }
    );
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/api/signup"],
};
```

## Zod Integration

### `truelistEmail(options?)`

Creates a Zod string schema with async email validation via Truelist. Designed for Server Action form validation.

```ts
import { z } from "zod";
import { truelistEmail } from "@truelist/nextjs/zod";

const signupSchema = z.object({
  email: truelistEmail(),
  name: z.string().min(1),
});

// In your Server Action -- must use parseAsync:
export async function signup(formData: FormData) {
  const data = await signupSchema.parseAsync({
    email: formData.get("email"),
    name: formData.get("name"),
  });
  // data.email is guaranteed valid by Truelist
}
```

#### Options

```ts
truelistEmail({
  rejectStates: ["invalid", "risky"], // default: ["invalid"]
  message: "This email cannot receive mail.", // custom error message
  apiKey: "override-key",             // default: process.env.TRUELIST_API_KEY
  baseUrl: "https://...",             // custom API URL
});
```

The Zod schema reads `process.env.TRUELIST_API_KEY` automatically -- no need to pass it for standard setups.

If the Truelist API is unreachable, validation passes through (fail-open) to avoid blocking form submissions.

## Configuration

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `TRUELIST_API_KEY` | Yes | Your Truelist API key from [truelist.io/dashboard](https://truelist.io/dashboard) |

All functions accept an `apiKey` config option to override the environment variable.

### API Endpoints Used

| Module | Endpoint | Rate Limit | Runtime |
|--------|----------|------------|---------|
| `@truelist/nextjs/server` | `POST /api/v1/verify` | 10 req/s | Node.js |
| `@truelist/nextjs/middleware` | `POST /api/v1/form_verify` | 60 req/min | Edge |
| `@truelist/nextjs/zod` | `POST /api/v1/verify` | 10 req/s | Node.js |

## Types

All types are exported from the main entry point and individual subpaths:

```ts
import type {
  // Next.js-specific
  ValidateEmailConfig,
  EmailValidationMiddlewareConfig,
  ValidateEmailMiddlewareOptions,
  EmailValidationResult,
  EmailValidationErrorResponse,

  // Re-exported from truelist SDK
  ValidationResult,
  ValidationState,
  ValidationSubState,
} from "@truelist/nextjs";
```

### `ValidationState`

`"valid"` | `"invalid"` | `"risky"` | `"unknown"`

### `ValidationSubState`

`"ok"` | `"accept_all"` | `"disposable_address"` | `"role_address"` | `"failed_mx_check"` | `"failed_spam_trap"` | `"failed_no_mailbox"` | `"failed_greylisted"` | `"failed_syntax_check"` | `"unknown"`

## Related Packages

- [`truelist`](https://www.npmjs.com/package/truelist) -- Node.js SDK
- [`@truelist/react`](https://www.npmjs.com/package/@truelist/react) -- React hooks and components

## License

MIT
