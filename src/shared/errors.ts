// The API's one error shape, shared by the server (which sends it) and the client (which reads it).
// `error` is the message for the person; `code` is stable for code to branch on; `fields` maps an input
// path ("title", "lists.0.name") to what is wrong with it; `requestId` matches the server's log line.

export const ERROR_CODES = ["invalid", "unauthenticated", "forbidden", "not_found", "conflict", "gone", "too_large", "unavailable", "internal"] as const;
export type ErrorCode = (typeof ERROR_CODES)[number];

export interface ErrorBody {
  error: string;
  code: ErrorCode;
  requestId: string;
  fields?: Record<string, string>;
}

/** The code a status implies when nothing more specific applies. */
export function codeForStatus(status: number): ErrorCode {
  switch (status) {
    case 400:
    case 422:
      return "invalid";
    case 401:
      return "unauthenticated";
    case 403:
      return "forbidden";
    case 404:
      return "not_found";
    case 409:
      return "conflict";
    case 410:
      return "gone";
    case 413:
      return "too_large";
    case 502:
    case 503:
    case 504:
      return "unavailable";
    default:
      return status >= 500 ? "internal" : "invalid";
  }
}
