# syntax=docker/dockerfile:1
# Claude Design Sync, hosted (e.g. Dokploy). The image is only the toolchain: Node, git, zip, Claude Code and
# Chromium's system libraries. The tool runs from a clone of the repo on the /data volume (entrypoint.sh),
# because it compares, branches, merges and pushes that clone. Build context: this folder.

FROM node:22-bookworm-slim
ARG PLAYWRIGHT_VERSION=1.63.0
RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates git openssh-client tini unzip zip \
  && npm install -g @anthropic-ai/claude-code \
  && npx -y "playwright@${PLAYWRIGHT_VERSION}" install-deps chromium \
  && rm -rf /var/lib/apt/lists/* /root/.npm

# Everything that must survive a redeploy lives on /data: the clone (with the tool's .state/ and uploads/),
# Claude Code's login in $HOME, run worktrees in $TMPDIR, and the Chromium download.
ENV HOME=/data/home TMPDIR=/data/tmp PLAYWRIGHT_BROWSERS_PATH=/data/ms-playwright \
  CDS_HOST=0.0.0.0 CDS_PORT=4477 CDS_PUSH_AFTER_MERGE=1
RUN mkdir -p /data && chown node:node /data
COPY --chmod=755 entrypoint.sh /usr/local/bin/cds-entrypoint
USER node
VOLUME /data
EXPOSE 4477
# Start-up runs npm ci and the Chromium download on a fresh volume, hence the long start period
HEALTHCHECK --interval=30s --timeout=5s --start-period=10m --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:' + process.env.CDS_PORT + '/healthz').then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))"
ENTRYPOINT ["tini", "--", "cds-entrypoint"]
