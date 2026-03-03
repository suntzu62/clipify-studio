FROM node:20-bullseye-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    ca-certificates \
    curl \
    ffmpeg \
    python3 \
    make \
    g++ \
    pkg-config \
    libcairo2-dev \
    libpango1.0-dev \
    libjpeg62-turbo-dev \
    libgif-dev \
    librsvg2-dev \
  && curl -L "https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_linux" -o /usr/local/bin/yt-dlp \
  && chmod +x /usr/local/bin/yt-dlp \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

EXPOSE 3000
