FROM node:20-bookworm AS base

RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    python3 \
    ca-certificates \
    curl \
    make \
    g++ \
    pkg-config \
    libcairo2-dev \
    libpango1.0-dev \
    libjpeg-dev \
    libgif-dev \
    librsvg2-dev \
    libpixman-1-dev \
    && rm -rf /var/lib/apt/lists/*

# Install a recent yt-dlp (Debian repo version is often outdated and breaks with YouTube changes)
RUN curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_linux -o /usr/local/bin/yt-dlp \
    && chmod 0755 /usr/local/bin/yt-dlp \
    && yt-dlp --version

WORKDIR /app

FROM base AS deps
COPY package.json package-lock.json ./
# Needed for postinstall (downloads face-api models)
COPY scripts ./scripts
RUN npm ci

FROM deps AS build
COPY . .
RUN npm run build && npm prune --omit=dev

FROM base AS runner
ENV NODE_ENV=production
WORKDIR /app

COPY --from=build /app/package.json /app/package-lock.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/models ./models
COPY --from=build /app/migrations ./migrations

EXPOSE 3001
CMD ["node", "dist/index.js"]
