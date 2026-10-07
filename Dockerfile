# syntax=docker/dockerfile:1
# Production image (README › Production): one Node process serves the API and the built client.
# Build: all dependencies → `npm run build`. Runtime: production dependencies, dist/, dist-server/, drizzle/.

FROM node:22-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
RUN npm run build

FROM node:22-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts --no-audit --no-fund

FROM node:22-slim
ENV NODE_ENV=production PORT=3000 UPLOAD_DIR=/data/uploads
WORKDIR /app
# package.json carries "type": "module" for dist-server; drizzle/ feeds MIGRATE_ON_START.
COPY package.json ./
COPY drizzle ./drizzle
COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/dist-server ./dist-server
# A named volume mounted at /data starts from this directory, so uploads stay writable for `node`.
RUN mkdir -p /data/uploads && chown -R node:node /data
USER node
EXPOSE 3000
# Liveness only: a refused configuration or failed migration exits before the API ever answers.
HEALTHCHECK --interval=30s --timeout=3s --start-period=30s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:' + process.env.PORT + '/api/health').then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))"
# node directly (not npm start) so SIGTERM reaches the graceful shutdown in src/server/index.ts.
CMD ["node", "dist-server/index.js"]
