# Todoi for agents

How an AI agent or script reads and changes Todoi on someone's behalf.

## Sign in with a token

The person creates a token in Account › API tokens (https://todoi.com/account?s=tokens) and gives it to you. Send it with every request. The token acts as that person, with exactly their access, until it expires or they revoke it.

```
Authorization: Bearer tdi_…
Content-Type: application/json
```

## The API

JSON over HTTPS at `https://todoi.com/api`.

- `GET /groups`: groups with their projects
- `GET /projects/:id`: a project with its lists and members
- `GET /items?projectId=` or `?listId=`: items (no parameter: the Inbox)
- `GET /search?q=`: find items by title or key
- `POST /items`: add an item: `{ "id", "title", "listId"?, "dueDate"?, "priority"? }`
- `PATCH /items/:id`: change fields; `{ "done": true }` completes it
- `POST /items/:id/move`: `{ "listId", "position"? }`
- `POST /items/:id/comments`: `{ "id", "body" }`
- `GET /me/export`: everything the person can see, as one JSON file

## Good manners

- You choose new ids: 21 characters from `A–Z a–z 0–9 _ -`. Dates are `YYYY-MM-DD`. Priority is `URGENT`, `HIGH`, `MEDIUM` or `LOW`.
- To retry a write safely, send the same `X-Todoi-Operation-Id` header again; Todoi applies it once.
- Errors return a status code and a plain sentence in `error`; show it to the person rather than guessing.
- Read before you write, and delete or archive only when the person asked you to.
