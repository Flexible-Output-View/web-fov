FROM ubuntu:latest

EXPOSE 8080

RUN apt update

RUN apt install -y npm

COPY . /app/

WORKDIR /app

RUN ls

RUN npm install -g http-server

CMD [ "http-server" ]