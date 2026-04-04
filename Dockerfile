FROM node:18-alpine

WORKDIR /app

COPY package*.json ./

# Install deps if package-lock exists; keep tolerant for scaffold state
RUN if [ -f package-lock.json ]; then npm ci --silent; else npm i --silent; fi

COPY . .

# Build step (may be no-op until Next.js is scaffolded)
RUN if [ -f package.json ]; then npm run build || true; fi

EXPOSE 3000

CMD ["npm", "run", "dev"]
