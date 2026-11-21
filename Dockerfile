# The Claritia site and app: build Next.js, then serve it.
FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:22-bookworm-slim
ENV NODE_ENV=production PORT=3000
WORKDIR /app
COPY --from=build /app/package.json /app/package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts && rm -rf /root/.npm
COPY --from=build /app/.next ./.next
COPY --from=build /app/next.config.ts ./
# Static files (empty-screen pictures, form art, email images) are served from public/.
COPY --from=build /app/public ./public
RUN useradd --create-home web && chown -R web /app
# The server's deploy script, so deploy/deploy.sh on the server can update itself from the newest image.
COPY deploy/deploy.sh ./deploy/deploy.sh
# Which commit this image is, for /api/version (src/app/api/version/route.ts). Last, so it never busts the cache above.
ARG GIT_COMMIT=""
ENV GIT_COMMIT=$GIT_COMMIT
USER web
EXPOSE 3000
CMD ["npx", "next", "start", "-p", "3000"]
