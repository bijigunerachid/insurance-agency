# The proxy image: Caddy serves the built screens and forwards /api to the API, over HTTPS with
# its own local certificate authority. Runs unprivileged on ports 8080/8443 (published as 80/443).
#   docker build -f deployment/production/proxy.Dockerfile -t insurance-agency-proxy:<version> .

# node:24.22.1-trixie-slim (Debian 13), pinned by digest
FROM node@sha256:89c5244bc22a9bc3287d89ebc7e49b9cb5bb84cd40e6175ac3421d5a9f68b95a AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY backend/package.json backend/
COPY frontend/package.json frontend/
RUN npm ci --workspace frontend --no-audit --no-fund
COPY frontend/ frontend/
RUN npm run build -w frontend

# caddy:2.11.7-alpine, pinned by digest
FROM caddy@sha256:e70b164da81ef698b3ad19af799ea6086ce6d9e48ed4079eb9fe26f6fbf14ee5
COPY deployment/production/Caddyfile /etc/caddy/Caddyfile
COPY --from=build /app/frontend/dist /srv
# Certificates and the local authority's key live in /data (a volume, in the backups).
# The official binary carries the "bind low ports" file capability, which a container without any
# capability (cap_drop ALL, no-new-privileges) refuses to run: a plain copy, it listens on 8080/8443.
# curl and the capability tools are not used by Caddy: removed (fewer packages to patch).
RUN install -m 0755 /usr/bin/caddy /usr/bin/caddy.plain && mv /usr/bin/caddy.plain /usr/bin/caddy \
  && apk del --no-cache curl libcap-utils \
  && mkdir -p /data /config && chown -R 1000:1000 /data /config
USER 1000:1000
EXPOSE 8080 8443
