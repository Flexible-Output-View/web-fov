FROM node:22-slim

WORKDIR /app

# Install Angular CLI globally
RUN npm install -g @angular/cli@latest

# Copy package files and install deps
COPY package*.json ./
RUN npm ci

# Copy rest of the app
COPY . .

EXPOSE 4200

# Start the dev server, listen on all interfaces so host can reach it
CMD ["ng", "serve", "--host", "0.0.0.0", "--port", "4200"]
