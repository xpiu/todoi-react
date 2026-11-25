# Todoi for agents

How an AI agent or script reads and changes Todoi on someone's behalf.

## Sign in with a token

The person creates a token in Account › API tokens (https://todoi.com/account?s=tokens) and gives it to you. Send it with every request. The token acts as that person until it expires or they revoke it, and never does more than they could: it is read only or read and write, and reaches every project and their Inbox or only the projects they picked.

```
Authorization: Bearer tdi_…
Content-Type: application/json
```

## The API

JSON over HTTPS at `https://todoi.com/api/v1`. Tokens work only there; anything not part of v1 answers 404.

- `GET /groups`: groups with their projects
- `GET /projects/:id`: a project with its lists and members
- `GET /items?projectId=` or `?listId=`: items (no parameter: the Inbox)
- `GET /search?q=`: find items by title or key
- `POST /items`: add an item: `{ "id", "title", "listId"?, "dueDate"?, "priority"? }`
- `PATCH /items/:id`: change fields; `{ "done": true }` completes it
- `POST /items/:id/move`: `{ "listId", "position"? }`
- `POST /items/:id/comments`: `{ "id", "body" }`
- `GET /me/export`: everything the person can see, as a `.zip` Todoi archive (a `todoi-archive.json` manifest, one JSON file per project, the Inbox and the attachment files); a token limited to some projects can't export

## Good manners

- You choose new ids: 21 characters from `A–Z a–z 0–9 _ -`. Dates are `YYYY-MM-DD`. Priority is `URGENT`, `HIGH`, `MEDIUM` or `LOW`.
- To retry a write safely, send the same `X-Todoi-Operation-Id` header again; Todoi applies it once.
- Errors return a status code and a plain sentence in `error`; show it to the person rather than guessing.
- Read before you write, and delete or archive only when the person asked you to.
