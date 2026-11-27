# AGENTS.md

This file provides guidance to AI agents when working with code in this repository.

- Avoid duplication of code whenever possible, which means checking for other areas of the codebase that might already have similar code and functionality.
- When fixing an issue or bug: do not introduce a new pattern or technology without first exhausting most options for the existing implementation. 
- If you introduce a new pattern or technology, check whether it is safe to remove the older implementation after implementing the new pattern or technology, to avoid duplicate logic.
- Production architecture takes priority over Claude Design readability; Storybook and claude-design-sync must adapt to both. Use composable React APIs, immutable state, Base UI primitives with correct ref/behavioral prop forwarding, focused Zustand selectors, computed derived values, and scoped stores for independent instances. 
- Design synchronisation, via ``tools/claude-design-sync/``, is not allowed to constrain our app's React and Base UI, although it can comply with it. Readability does not guarantee interaction fidelity.
- If you discover things that might hinder the goals of the latest assignment, then feel free to pause and ask the user for clarification.
- Our domains are todoi.com and todoi.org. Use todoi.com by default in links, emails, IDs and examples, with the address that fits its purpose (`info@todoi.com` for contact, `no-reply@todoi.com` as a sender, others as needed). Some core features will be reused at todoi.org, so a variant built for it may use todoi.org addresses instead (`info@todoi.org`). We don't own todoi.app, so never use it.
- If you decide to make and use new git branches for your work, then you MUST merge your work back into our `main` branch after working on your new git branch.
- Git commit with a relevant message after completing a feature or subfeature, unless the files are in .gitignore
- Git push after completing a task