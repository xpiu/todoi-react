// Attachment upload limits, shared so the client can refuse a file before sending it.
// The API enforces them before buffering a request body (routes/attachments.ts).

export const MB = 1024 * 1024;
/** Largest single file */
export const MAX_ATTACHMENT_BYTES = 25 * MB;
/** Files in one upload request (the app sends one file per request) */
export const MAX_FILES_PER_UPLOAD = 10;
/** Whole multipart request: one maximum-size file plus form overhead, so a request is bounded before parsing */
export const MAX_UPLOAD_REQUEST_BYTES = MAX_ATTACHMENT_BYTES + MB;
/** Stored attachment bytes per uploader */
export const ATTACHMENT_QUOTA_BYTES = { guest: 100 * MB, account: 2048 * MB } as const;

export const tooLargeMessage = (name: string) => `${name} is larger than ${MAX_ATTACHMENT_BYTES / MB} MB`;
export const quotaMessage = (guest: boolean) =>
  guest ? `Guest workspaces can store up to ${ATTACHMENT_QUOTA_BYTES.guest / MB} MB of attachments. Sign up to store more.` : `Your account can store up to ${ATTACHMENT_QUOTA_BYTES.account / 1024 / MB} GB of attachments.`;
