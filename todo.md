# To-do

- start paying for backup service to backup our project (e.g. Backblaze or something cheap like it)
description: "we need to have better backups for failure situations", created: 2026-11-28, prio: urgent, 

- add cloudflare r2 for media files and imgs and attachments
  created: 2026-11-28
  > @agent: Added at Charlie's request. Reference: https://www.cloudflare.com/products/r2/
  > @agent: Proposed conservative starting limits per Todoi account (not Cloudflare account): 100 MB total storage, 10 MB per file, 100 stored files, and 20 uploads per day; count images and generated variants toward the same storage quota. These are suggested application limits, not Cloudflare limits.
  > @agent: Enforce quotas server-side before upload with concurrency-safe reservations, require authenticated uploads and authorized downloads, and clean up deleted/orphaned objects. Show usage and clear limit errors; keep limits configurable and monitor aggregate R2 storage/request costs across all accounts.

- we need to consider whether our domain construction rules in the old s.todoi.com are better that the recent domain construction ones at staging.todoi.com (e.g. https://staging.todoi.com/p/7SpNP1vU6eJE33e-_VnC0?v=board ) , ref. old docs .tmp/20261126_tasks.md & .tmp/20261125_report.html 
created: 2026-11-27, prio: high
- Develop an MVP that works locally
  created: 20261010
  - Keep debugging the app until it behaves closer to the one in Claude Design
    created: 20261010
  - Fix the issue with the Subnavbar- it looks much better in Claude Design than in the app
    created: 20261010
- Migrate yr todo/todo.md from the todoi repo to this todoi-react repo
  created: 20261010
- Write the docs for people at '/docs' (only a brief one-page placeholder so far)
  created: 20261010
- Write the docs for agents at '/docs/agents' (only a brief one-page placeholder so far)
  created: 20261010
- check https://www.werkyn.com/ (competitor) - they have some nice designs there -> perhaps move this to our todoi-business repo where there is its own competitors folder
  created: 20261010

# Backlog

- Automate updates. A weekly grouped Dependabot or Renovate config with a few days' minimum release age would cover item 8 automatically.
  created: 20261010
