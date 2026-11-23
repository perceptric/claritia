# The Claritia app: build Next.js, then serve it.
FROM node:22-bookworm-slim AS build
WORKDIR /app
# Every workspace's packages, so the build's type check sees the whole repo.
COPY package.json package-lock.json ./
COPY collect/package.json collect/
COPY worker/package.json worker/
COPY worker-intel/package.json worker-intel/
RUN npm ci
COPY . .
RUN npm run build

FROM node:22-bookworm-slim
ENV NODE_ENV=production PORT=3000
WORKDIR /app
# The app's own packages only, without the services' workspaces.
COPY --from=build /app/package.json /app/package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts --workspaces=false && rm -rf /root/.npm
COPY --from=build /app/.next ./.next
COPY --from=build /app/next.config.ts ./
RUN useradd --create-home web && chown -R web /app
USER web
EXPOSE 3000
CMD ["npx", "next", "start", "-p", "3000"]
