# Workspace synchronization

Workspace JSON writes use the existing Hono RPC client, TanStack Query and Zustand stores. No service worker, replicated database framework or server push is required.

## Saving and replay

The RPC transport stores an operation and its projected query snapshots together in one strict IndexedDB transaction before attempting the network. Records are partitioned by session user ID. A queue remains available after reload or closing a tab; clearing browser storage removes it. Unsubmitted overlay text still uses the existing per-tab draft store.

Operations replay in insertion order, including creates before subsequent edits and comments. A Web Lock coordinates tabs, and BroadcastChannel refreshes their local state. Persisted acknowledgment results settle a request even when another tab replayed it. Fetch failures, timeouts, HTTP 408/425/429 and server errors retry with bounded exponential backoff. A rejected operation stops replay until it is retried or discarded.

Each replay sends its original owner ID; the mutation endpoint authenticates the current session and rejects an owner mismatch before any writes. No separate session preflight is needed. A 401 keeps pending changes as failed drafts until the original account returns and retries them. A cached offline identity does not authorize server writes. Queues are never replayed as another user. Guest sign-in/sign-up first drains outstanding changes; unresolved guest changes keep authentication on the form with a recovery message, since transferring the guest removes its original identity.

Successful sign-out clears the active offline identity before navigation. Stored work stays partitioned under its original owner for recovery after a later login; an unavailable session check cannot reopen that account after explicit sign-out.

## Server guarantees

Queued operations carry a stable ID and optional base version. The API locks each actor/operation pair and records the request fingerprint, response and authorization scopes in the same PostgreSQL transaction as content, activity and notifications. A lost-response retry returns the committed receipt without repeating side effects. Reusing an ID for another request returns a conflict; current authorization is checked even when replaying a receipt.

Editable rows have versions, including relationships that change their meaning. A stale base version returns 409. Successful responses acknowledge the target and affected rows, letting later queued edits account for this queue's own side effects while preserving conflicts caused by earlier remote edits. Physical attachment cleanup runs only after commit.

A new comment acknowledges both its parent item and its own canonical version. Edits or reactions already queued for that comment inherit the child's version; an intervening remote edit then requires conflict review instead of silently replacing its text.

## Incoming changes and recovery

Scoped authoritative snapshots refresh on reconnect, focus/navigation, after edits and every 30 seconds in visible tabs. Restored snapshots revalidate immediately on a new page. Pending operations overlay only their changed fields; unrelated server fields remain visible. Query cancellation reaches the HTTP request, and in-flight reads from before a successful write are cancelled before removing its local overlay. Confirmed server responses update cached snapshots in the same transaction as queue removal, so an immediate offline reload retains the acknowledged change. Reaction operations also retain their intended local state to avoid flipping when a lost-response snapshot already contains the committed toggle.

Storage & sync retains submitted text and offers Copy and Retry. Conflicts require a confirmed choice: apply the saved fields over the current record, or keep the server version. Applying a conflict creates a new operation ID; it does not reuse an old receipt with a different request. Deleted or inaccessible content is purged from cached scopes, while submitted text remains available for recovery. Authoritative refusals are retained so reopening offline cannot reveal the purged content.

Stored refusals also clear live data in other tabs when they adopt the shared workspace, including a tab whose own API requests are offline. Item edit and move acknowledgements include canonical relationship fields; a move returns its updated family so local snapshots keep destination labels, allowed assignees and versions without waiting for another GET.

## Boundaries

The queue covers workspace JSON writes, including item/comment changes, lifecycle actions, attachment metadata, preferences and profile edits. Binary uploads, authentication, session management, tokens and exports require a connection. Application-shell offline caching and installation are separate work; the browser tests block API traffic while allowing the app shell to load.

Snapshots use the current API scopes. Sequence-based deltas, SSE, concurrent character-level editing and repository file synchronization remain deferred. Browser storage and PostgreSQL/uploads still need their respective retention and backup policies; the outgoing queue is not a backup.

Staging targets `https://staging.todoi.com`; this change does not deploy it.
