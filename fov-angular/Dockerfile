FROM node:22-slim

EXPOSE 8080

RUN npm install -g @angular/cli@latest

COPY . /app/
WORKDIR /app

RUN rm package-lock.json; rm -rf node_modules; exit 0

RUN npm i

CMD [ "ng", "serve", "--port", "8080", "--host", "0.0.0.0" ]