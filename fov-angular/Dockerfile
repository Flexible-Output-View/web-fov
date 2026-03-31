FROM node:22-slim AS build

WORKDIR /app

ARG API_URL
ARG TWITCH_ID
ARG TWITCH_SECRET

# Install Angular CLI globally
RUN npm install -g @angular/cli@latest

# Copy package files and install deps
COPY package*.json ./

RUN npm i --package-lock-only

RUN npm ci

# Copy rest of the app
COPY . .

RUN cp src/environments/environment.example.ts src/environments/environment.ts
RUN sed -i "s|API_URL_HERE|$API_URL|g" src/environments/environment.ts
RUN sed -i "s|YOUR_CLIENT_ID_HERE|$TWITCH_ID|g" src/environments/environment.ts
RUN sed -i "s|YOUR_CLIENT_SECRET_HERE|$TWITCH_SECRET|g" src/environments/environment.ts

# FOR DEV ONLY Start the dev server, listen on all interfaces so host can reach it
# CMD ["ng", "serve", "--host", "0.0.0.0", "--port", "80"]
# EXPOSE 80


# Production server
RUN npx ng build --configuration production

FROM nginx:stable-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist/fov-angular/browser /usr/share/nginx/html

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
