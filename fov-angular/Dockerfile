FROM node:22.23.3-bookworm-slim AS build

WORKDIR /app

RUN npm install -g @angular/cli@22.2.1
COPY package.json package-lock.json ./
RUN npm ci

COPY . .

# Just ensure Angular environment points to the relative path '/api'
RUN cp src/environments/environment.example.ts src/environments/environment.ts
RUN sed -i "s|API_URL_HERE|/api|g" src/environments/environment.ts

RUN npx ng build --configuration production

FROM nginx:1.27.4-alpine

# Place template in /etc/nginx/templates/ so Nginx auto-substitutes ${API_URL} on startup
COPY nginx.conf.template /etc/nginx/templates/default.conf.template
COPY --from=build /app/dist/fov-angular/browser /usr/share/nginx/html

# Default fallback if the user doesn't pass an environment variable
ENV API_URL=http://backend:4000

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
