# claritia-collect: the events service. Builds claritia.js, then runs the TypeScript sources directly with Node.
# Packages come from the repo's one lockfile, installed for the collect workspace only.
FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY collect/package.json collect/
COPY worker/package.json worker/
COPY worker-intel/package.json worker-intel/
RUN npm ci -w collect --no-audit --no-fund
COPY collect/ ./collect/
COPY src/lib/web/ ./src/lib/web/
RUN node collect/script/build.mts

FROM node:22-bookworm-slim
ENV NODE_ENV=production PORT=8080
WORKDIR /app
COPY package.json package-lock.json ./
COPY collect/package.json collect/
COPY worker/package.json worker/
COPY worker-intel/package.json worker-intel/
RUN npm ci -w collect --omit=dev --no-audit --no-fund && rm -rf /root/.npm
COPY --from=build /app/collect/dist ./collect/dist
COPY collect/*.ts ./collect/
COPY src/lib/web/ ./src/lib/web/
COPY src/lib/sign.ts ./src/lib/
# The shared files under src/ are ES modules too.
RUN echo '{"type":"module"}' > /app/package.json
WORKDIR /app/collect
USER node
EXPOSE 8080
CMD ["node", "server.ts"]
