# @truelist/nextjs

Email validation for Next.js -- Server Actions, Route Handlers, and Zod integration powered by [Truelist.io](https://truelist.io).

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

Validate a single email address using the Truelist server-side API (`POST /api/v1/verify_inline`).

```ts
import { validateEmail } from "@truelist/nextjs/server";

const result = await validateEmail("user@example.com");

result.email;       // "user@example.com"
result.domain;      // "example.com"
result.canonical;   // "user"
result.mxRecord;    // "mx.example.com" or null
result.firstName;   // null
result.lastName;    // null
result.state;       // "ok" | "email_invalid" | "risky" | "unknown" | "accept_all"
result.subState;    // "email_ok" | "is_disposable" | "is_role" | ...
result.verifiedAt;  // "2026-02-21T10:00:00.000Z"
result.suggestion;  // null or "user@gmail.com"
result.isValid;     // true (convenience: state === "ok")
result.isInvalid;   // false (convenience: state === "email_invalid")
result.isDisposable;// false (convenience: subState === "is_disposable")
result.isRole;      // false (convenience: subState === "is_role")
```

#### Options

```ts
const result = await validateEmail("user@example.com", {
  apiKey: "custom-key",                      // Override env var
  baseUrl: "https://...",                    // Custom API URL
  rejectStates: ["email_invalid", "risky"],  // States that set isValid=false
});
```

### `createEmailValidator(config)`

Create a pre-configured validator for reuse across multiple Server Actions.

```ts
import { createEmailValidator } from "@truelist/nextjs/server";

const validate = createEmailValidator({
  rejectStates: ["email_invalid", "risky"],
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

## Route Handler Helpers

Validate email fields in form submissions inside your Route Handlers. Works in both Node.js and Edge runtimes.

### `createValidationHandler(config)`

Creates a validation function you call at the top of your Route Handler. Returns a `NextResponse` (422) if the email is rejected, or `null` if it passes.

```ts
// app/api/signup/route.ts
import { createValidationHandler } from "@truelist/nextjs/middleware";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const validate = createValidationHandler({
  paths: ["/api/signup"],
  rejectStates: ["email_invalid"],  // default
});

export async function POST(request: NextRequest) {
  const blocked = await validate(request);
  if (blocked) return blocked; // 422 response

  // Email passed validation - continue with your logic
  return NextResponse.json({ success: true });
}
```

When an invalid email is detected, the handler returns:

```json
{
  "error": "Invalid email",
  "details": {
    "state": "email_invalid",
    "subState": "failed_no_mailbox",
    "suggestion": null
  }
}
```

with HTTP status `422 Unprocessable Entity`.

#### Config Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `paths` | `string[]` | (required) | Route path prefixes to validate (uses `startsWith` matching) |
| `fieldName` | `string` | `"email"` | Form field name containing the email |
| `rejectStates` | `ValidationState[]` | `["email_invalid"]` | States that trigger a 422 response |
| `apiKey` | `string` | `process.env.TRUELIST_API_KEY` | API key override |
| `baseUrl` | `string` | `https://api.truelist.io` | API base URL override |
| `timeout` | `number` | `10000` | Fetch timeout in milliseconds |

### `validateFormSubmission(request, options?)`

Lower-level helper for custom Route Handler logic. Returns the `ValidationResult` or `null`.

```ts
// app/api/signup/route.ts
import { validateFormSubmission } from "@truelist/nextjs/middleware";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export async function POST(request: NextRequest) {
  const result = await validateFormSubmission(request, {
    fieldName: "email",
  });

  if (result?.state === "email_invalid") {
    return NextResponse.json(
      { error: "Invalid email", suggestion: result.suggestion },
      { status: 422 }
    );
  }

  if (result?.subState === "is_disposable") {
    return NextResponse.json(
      { error: "Disposable emails are not allowed" },
      { status: 422 }
    );
  }

  return NextResponse.json({ success: true });
}
```

## Zod Integration

### `truelistEmail(options?)`

Creates a Zod string schema with async email validation via Truelist. Designed for Server Action form validation.

**Important**: If the API key is missing, validation throws an error rather than silently passing. Only transient network/API errors fail open.

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
  rejectStates: ["email_invalid", "risky"], // default: ["email_invalid"]
  message: "This email cannot receive mail.", // custom error message
  apiKey: "override-key",             // default: process.env.TRUELIST_API_KEY
  baseUrl: "https://...",             // custom API URL
});
```

The Zod schema reads `process.env.TRUELIST_API_KEY` automatically -- no need to pass it for standard setups.

If the Truelist API is unreachable, validation passes through (fail-open) to avoid blocking form submissions. However, a missing API key will always throw an error.

## Configuration

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `TRUELIST_API_KEY` | Yes | Your Truelist API key from [truelist.io/dashboard](https://truelist.io/dashboard) |

All functions accept an `apiKey` config option to override the environment variable.

### API Endpoint Used

| Module | Endpoint | Runtime |
|--------|----------|---------|
| `@truelist/nextjs/server` | `POST /api/v1/verify_inline?email=...` | Node.js |
| `@truelist/nextjs/middleware` | `POST /api/v1/verify_inline?email=...` | Node.js or Edge |
| `@truelist/nextjs/zod` | `POST /api/v1/verify_inline?email=...` | Node.js |

## Types

All types are exported from the main entry point and individual subpaths:

```ts
import type {
  // Next.js-specific
  ValidateEmailConfig,
  EmailValidationHandlerConfig,
  ValidateFormSubmissionOptions,
  EmailValidationResult,
  EmailValidationErrorResponse,

  // Re-exported from truelist SDK
  ValidationResult,
  ValidationState,
  ValidationSubState,
} from "@truelist/nextjs";
```

### `ValidationState`

`"ok"` | `"email_invalid"` | `"risky"` | `"unknown"` | `"accept_all"`

### `ValidationSubState`

`"email_ok"` | `"accept_all"` | `"is_disposable"` | `"is_role"` | `"failed_smtp_check"` | `"failed_mx_check"` | `"failed_spam_trap"` | `"failed_no_mailbox"` | `"failed_greylisted"` | `"failed_syntax_check"` | `"unknown_error"`

## Related Packages

- [`truelist`](https://www.npmjs.com/package/truelist) -- Node.js SDK
- [`@truelist/react`](https://www.npmjs.com/package/@truelist/react) -- React hooks and components

## License

MIT
