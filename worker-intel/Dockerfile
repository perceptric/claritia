# claritia-intel: the jobs that need no browser. Runs the TypeScript sources directly with Node.
FROM node:22-bookworm-slim
ENV NODE_ENV=production PORT=8080
WORKDIR /app
# The image root is the package, so shared files under src/ find the same node_modules.
COPY worker-intel/package.json worker-intel/package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund && rm -rf /root/.npm
COPY worker-intel/ ./worker-intel/
# All of src/lib: the jobs reach routing, forms, meetings, workflows and the rest, and a file left out crashes the
# worker at start (tests/workerImage.test.ts checks every import resolves inside this layout).
COPY src/lib/ ./src/lib/
USER node
EXPOSE 8080
CMD ["node", "worker-intel/index.ts"]
