# claritia-intel: the jobs that need no browser. Runs the TypeScript sources directly with Node.
FROM node:22-bookworm-slim
ENV NODE_ENV=production PORT=8080
WORKDIR /app
# Packages come from the repo's one lockfile, installed for the intel workspace only, into /app/node_modules,
# where the shared files under src/ find them too.
COPY package.json package-lock.json ./
COPY collect/package.json collect/
COPY worker/package.json worker/
COPY worker-intel/package.json worker-intel/
RUN npm ci -w worker-intel --omit=dev --no-audit --no-fund && rm -rf /root/.npm
# The shared files under src/ are ES modules too.
RUN echo '{"type":"module"}' > /app/package.json
COPY worker-intel/ ./worker-intel/
COPY src/lib/errors.ts src/lib/jobs.ts src/lib/seal.ts src/lib/sign.ts src/lib/site.ts src/lib/uuid.ts ./src/lib/
COPY src/lib/identity/ ./src/lib/identity/
COPY src/lib/company/ ./src/lib/company/
COPY src/lib/privateNet.ts ./src/lib/
COPY src/lib/web/signals.ts src/lib/web/scores.ts src/lib/web/accountAlerts.ts src/lib/web/policy.ts src/lib/web/ids.ts src/lib/web/scrub.ts ./src/lib/web/
COPY src/lib/contacts/ ./src/lib/contacts/
COPY src/lib/records/ ./src/lib/records/
COPY src/lib/filters.ts ./src/lib/
COPY src/lib/sources/ ./src/lib/sources/
USER node
EXPOSE 8080
CMD ["node", "worker-intel/index.ts"]
