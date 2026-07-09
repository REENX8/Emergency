### build stage ###############################################################
FROM node:20-alpine AS build

WORKDIR /app

# When bundled inside docker-compose, the browser hits same-origin /api,
# proxied by nginx (see nginx.conf) to the backend container.
ARG VITE_API_URL=/api
ENV VITE_API_URL=${VITE_API_URL}

COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

COPY . .
RUN npm run build


### runtime stage #############################################################
FROM nginx:1.27-alpine

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80
