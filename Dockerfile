FROM node:22-slim AS build_angular

RUN npm install -g @angular/cli@latest

COPY fov-angular /app/
WORKDIR /app

RUN rm package-lock.json; rm -rf node_modules; exit 0

RUN npm i

RUN mkdir /app/dist

RUN ng build --configuration=production

FROM ubuntu:latest AS server
EXPOSE 80
EXPOSE 1935

RUN apt update

RUN apt install -y nginx libnginx-mod-rtmp

COPY nginx.conf /etc/nginx/nginx.conf

RUN rm -rf  /usr/share/nginx/html

COPY --from=0 /app/dist/fov-angular /usr/share/nginx/html

CMD ["nginx", "-g", "daemon off;"]
