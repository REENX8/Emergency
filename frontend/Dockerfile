### build stage ###############################################################
FROM node:20-alpine AS build

WORKDIR /app

# Allow the API URL to be baked into the bundle at build time.
ARG REACT_APP_API_URL=/api
ENV REACT_APP_API_URL=${REACT_APP_API_URL}

COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

COPY . .
RUN npm run build


### runtime stage #############################################################
FROM nginx:1.27-alpine

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/build /usr/share/nginx/html

EXPOSE 80

# Use the default nginx entrypoint
