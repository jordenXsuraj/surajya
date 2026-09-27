FROM node:20-alpine

WORKDIR /app

# Install dependencies (all pure JS — no native build toolchain needed)
COPY package*.json ./
RUN npm ci --omit=dev || npm install --omit=dev

# Copy application source code
COPY . .

# Set default production environment
ENV NODE_ENV=production
ENV PORT=5000

EXPOSE 5000

CMD ["node", "index.js"]
