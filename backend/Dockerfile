FROM node:22-alpine AS build
WORKDIR /app
ENV DATABASE_URL=postgresql://build:build@localhost:5432/build?schema=public

COPY package.json tsconfig.base.json ./
COPY backend/package.json backend/package.json
COPY frontend/package.json frontend/package.json
COPY website/package.json website/package.json
COPY packages/contracts/package.json packages/contracts/package.json
RUN npm install --no-audit --no-fund

COPY packages/contracts packages/contracts
COPY backend backend
RUN npm run build --workspace @sessions/contracts \
 && npm run prisma:generate --workspace @sessions/backend \
 && npm run build --workspace @sessions/backend

FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
RUN apk add --no-cache ffmpeg
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/backend/dist ./backend/dist
COPY --from=build /app/backend/prisma ./backend/prisma
COPY --from=build /app/backend/package.json ./backend/package.json
USER node
EXPOSE 4000
CMD ["node", "backend/dist/main.js"]
