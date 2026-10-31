# The API image: Node 24 on Debian 13 slim, production dependencies only, run as the unprivileged
# "node" user with the code owned by root (it cannot change itself). Built from the repository root:
#   docker build -f deployment/production/api.Dockerfile -t insurance-agency-api:<version> .

# node:24.22.1-trixie-slim (Debian 13), pinned by digest
FROM node@sha256:89c5244bc22a9bc3287d89ebc7e49b9cb5bb84cd40e6175ac3421d5a9f68b95a AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY backend/package.json backend/
COPY frontend/package.json frontend/
# Exact versions from the lockfile; argon2 uses its prebuilt binary (no compiler in the image).
RUN npm ci --workspace backend --omit=dev --no-audit --no-fund
COPY backend/ backend/
RUN cd backend && npx prisma generate

FROM node@sha256:89c5244bc22a9bc3287d89ebc7e49b9cb5bb84cd40e6175ac3421d5a9f68b95a
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /app/package.json ./
COPY --from=build /app/node_modules node_modules
COPY --from=build /app/backend backend
# npm and corepack are not used on the server (the tools service runs node directly): removed,
# with their own dependencies to patch. The documents volume starts owned by the API user.
RUN rm -rf /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/corepack \
    /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack \
  && mkdir -p /data/documents && chown node:node /data/documents
USER node
WORKDIR /app/backend
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:3000/api/health').then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))"]
CMD ["node", "src/server.js"]
