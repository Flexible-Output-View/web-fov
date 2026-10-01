FROM node:22.12.0-bookworm-slim AS build

WORKDIR /app

ARG API_URL

# Angular CLI aligné sur fov-angular/package-lock.json (node_modules/@angular/cli).
# Ne pas utiliser @latest : casserait la reproductibilité.
RUN npm install -g @angular/cli@20.3.24

# Copy package files and install deps
# NOTE: ne pas régénérer le lock ici — npm ci utilise fov-angular/package-lock.json versionné
COPY package.json package-lock.json ./

RUN npm ci

# Copy rest of the app
COPY . .

RUN cp src/environments/environment.example.ts src/environments/environment.ts
RUN sed -i "s|API_URL_HERE|$API_URL|g" src/environments/environment.ts

# FOR DEV ONLY Start the dev server, listen on all interfaces so host can reach it
# CMD ["ng", "serve", "--host", "0.0.0.0", "--port", "80"]
# EXPOSE 80


# Production server
RUN npx ng build --configuration production

FROM nginx:1.27.4-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist/fov-angular/browser /usr/share/nginx/html

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
