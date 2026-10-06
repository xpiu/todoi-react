# AGENTS.md

This file provides guidance to AI agents when working with code in this repository.

- Avoid duplication of code whenever possible, which means checking for other areas of the codebase that might already have similar code and functionality.
- When fixing an issue or bug: do not introduce a new pattern or technology without first exhausting most options for the existing implementation. 
- If you introduce a new pattern or technology, check whether it is safe to remove the older implementation after implementing the new pattern or technology, to avoid duplicate logic.
- If you discover things that might hinder the goals of the latest assignment, then feel free to pause and ask the user for clarification.
- If you decide to make and use new git branches for your work, then you MUST merge your work back into our `main` branch after working on your new git branch.
- Git commit with a relevant message after completing a feature or subfeature, unless the files are in .gitignore

Production architecture takes priority over Claude Design readability; Storybook and claude-design-sync must adapt to both. Use typed, composable React APIs, immutable state, effects outside render, and local interaction state; Base UI primitives with correct ref/behavioral prop forwarding; server-side Hono validation, authorization, and database access with typed RPC and type-only server imports; and focused Zustand selectors, computed derived values, and scoped stores for independent instances. Keep design components, screens, client data access, and server code separate. Favor explicit props, named exports, brief behavioral docs, reusable tokens, and representative stories. Storybook renders real components with decorators supplying props/providers/mocks; keep its configuration and examples outside production imports. Sync owns component/CSS/story/doc association and React 18 UMD compatibility translation, without constraining React 19 or Base UI. Readability does not guarantee interaction fidelity. Validate design changes through application checks, preserving accessibility, server boundaries, and state ownership; adapt sync discovery/export rules as needed.
