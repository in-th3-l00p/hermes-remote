# hermes-remote server image.
#
#   docker build -t hermes-remote .
#   docker run -p 8643:8643 -v hermes-remote:/data \
#     -e HERMES_UPSTREAM_URL=http://host.docker.internal:8642 \
#     -e HERMES_UPSTREAM_KEY=... hermes-remote
#
# State (keys, chat.db, users.db, signing key, logs) lives in /data.

FROM oven/bun:1.4 AS build
WORKDIR /src
COPY . .
RUN bun install --frozen-lockfile
# One self-contained file: the CLI plus the server library and its deps.
# The Supabase and Clerk SDKs stay optional, as in the npm packages.
RUN bun build packages/cli/src/cli.ts --target bun \
      --external @supabase/supabase-js --external @clerk/backend \
      --outfile /out/bin/hermes-remote.js

FROM oven/bun:1.4-slim
WORKDIR /app
COPY --from=build /out/bin/hermes-remote.js /app/bin/hermes-remote.js
# The server reads its version from ../package.json next to the bundle.
COPY packages/hermes-api/package.json /app/package.json
ENV HERMES_REMOTE_HOME=/data
RUN mkdir -p /data && chown bun:bun /data
USER bun
VOLUME /data
EXPOSE 8643
HEALTHCHECK --interval=30s --timeout=3s CMD bun -e "fetch('http://127.0.0.1:8643/v1/status').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"
ENTRYPOINT ["bun", "/app/bin/hermes-remote.js"]
# Inside a container the port must be reachable from outside it.
CMD ["serve", "--host", "0.0.0.0"]
