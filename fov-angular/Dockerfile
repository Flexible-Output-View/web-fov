FROM node:22.23.3-bookworm-slim AS build

WORKDIR /app

RUN npm install -g @angular/cli@22.2.1
COPY package.json package-lock.json ./
RUN npm ci

COPY . .

# Point Angular environment to the relative path '/api'
RUN cp src/environments/environment.example.ts src/environments/environment.ts
RUN sed -i "s|API_URL_HERE|/api|g" src/environments/environment.ts

RUN npx ng build --configuration production

FROM node:22.23.3-bookworm-slim

WORKDIR /app
RUN npm install -g serve@14
COPY --from=build /app/dist/fov-angular/browser ./browser

EXPOSE 4200
CMD ["serve", "-s", "browser", "-l", "4200"]
