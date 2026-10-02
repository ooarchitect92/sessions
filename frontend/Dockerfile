FROM node:22-alpine AS build
WORKDIR /app
ARG VITE_API_URL=http://localhost:4000/v1
ARG VITE_AUTH_MODE=oidc
ARG VITE_DEV_ORGANIZATION_ID=
ARG VITE_DEV_WORKSPACE_ID=
ARG VITE_DEV_USER_ID=
ARG VITE_DEV_USER_EMAIL=
ENV VITE_API_URL=$VITE_API_URL
ENV VITE_AUTH_MODE=$VITE_AUTH_MODE
ENV VITE_DEV_ORGANIZATION_ID=$VITE_DEV_ORGANIZATION_ID
ENV VITE_DEV_WORKSPACE_ID=$VITE_DEV_WORKSPACE_ID
ENV VITE_DEV_USER_ID=$VITE_DEV_USER_ID
ENV VITE_DEV_USER_EMAIL=$VITE_DEV_USER_EMAIL

COPY package.json tsconfig.base.json ./
COPY backend/package.json backend/package.json
COPY frontend/package.json frontend/package.json
COPY website/package.json website/package.json
COPY packages/contracts/package.json packages/contracts/package.json
RUN npm install --no-audit --no-fund
COPY packages/contracts packages/contracts
COPY frontend frontend
RUN npm run build --workspace @sessions/contracts && npm run build --workspace @sessions/frontend

FROM nginx:1.27-alpine
COPY frontend/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/frontend/dist /usr/share/nginx/html
EXPOSE 80
