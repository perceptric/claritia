# The Claritia runner: Node 22 with Chromium and its system libraries.
FROM node:22-bookworm-slim

ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright \
    NODE_ENV=production \
    NODE_OPTIONS=--no-warnings
WORKDIR /app

# Chromium for the same playwright-core version the runner uses.
RUN npx -y playwright-core@1.63.0 install --with-deps chromium && rm -rf /root/.npm

# Packages come from the repo's one lockfile, installed for the runner workspace only.
COPY package.json package-lock.json ./
COPY collect/package.json collect/
COPY worker/package.json worker/
COPY worker-intel/package.json worker-intel/
RUN npm ci -w worker --omit=dev --ignore-scripts && rm -rf /root/.npm
# The shared files under src/ are ES modules too.
RUN echo '{"type":"module"}' > /app/package.json

COPY src/lib/claude.ts src/lib/errors.ts src/lib/lock.ts src/lib/planner.ts src/lib/privateNet.ts src/lib/seal.ts ./src/lib/
COPY worker ./worker

# Run as a normal user, not root.
RUN useradd --create-home runner && chown -R runner /app
USER runner

CMD ["node", "worker/index.ts"]
