# --- Stage 1: Build Frontend Assets ---
FROM node:20-alpine AS builder

WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm ci || npm install

# Copy source code
COPY . .

# Build arguments for environment variables embedded at build time
ARG VITE_API_URL=http://localhost:5000/api
ARG VITE_ADMIN_EMAIL=
ENV VITE_API_URL=$VITE_API_URL
ENV VITE_ADMIN_EMAIL=$VITE_ADMIN_EMAIL

# Build static bundle
RUN npm run build

# --- Stage 2: Serve with Nginx ---
FROM nginx:alpine

# Copy custom nginx configuration
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Copy build artifacts to nginx public html directory
COPY --from=builder /app/dist /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
