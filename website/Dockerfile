FROM node:22-alpine AS build
WORKDIR /app
ARG VITE_APP_URL=http://localhost:3000
ARG VITE_API_URL=http://localhost:4000/v1
ENV VITE_APP_URL=$VITE_APP_URL
ENV VITE_API_URL=$VITE_API_URL

COPY package.json tsconfig.base.json ./
COPY backend/package.json backend/package.json
COPY frontend/package.json frontend/package.json
COPY website/package.json website/package.json
COPY packages/contracts/package.json packages/contracts/package.json
RUN npm install --no-audit --no-fund
COPY website website
RUN npm run build --workspace @sessions/website

FROM nginx:1.27-alpine
COPY website/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/website/dist /usr/share/nginx/html
EXPOSE 80
