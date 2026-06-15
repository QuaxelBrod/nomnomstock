FROM node:18-bullseye-slim

ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH

WORKDIR /app

RUN corepack enable && corepack prepare pnpm@8.8.0 --activate

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY backend/package.json backend/package.json
COPY frontends/web/package.json frontends/web/package.json
COPY packages/shared/package.json packages/shared/package.json
COPY services/offers/package.json services/offers/package.json

RUN pnpm install --frozen-lockfile

COPY . .

EXPOSE 3000
EXPOSE 3001
EXPOSE 3010

CMD ["pnpm", "dev"]
