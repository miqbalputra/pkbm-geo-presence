# Frontend build: React 19 + TypeScript + Vite + Tailwind v4
FROM node:24-alpine AS frontend
WORKDIR /src

COPY package*.json ./
RUN npm ci

COPY index.html vite.config.ts tsconfig.json ./
COPY src ./src
COPY public ./public
RUN npm run build

# Backend build: Go 1.25 + Fiber + GORM
FROM golang:1.25-alpine AS backend
WORKDIR /src/backend

COPY backend/go.mod backend/go.sum ./
RUN go mod download

COPY backend ./
RUN CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -trimpath -ldflags="-s -w" -o /out/presensi-pkbm ./cmd/server

# Minimal runtime: Go binary + static Vite assets
FROM alpine:3.22 AS runtime
RUN addgroup -S app && adduser -S -G app app \
    && apk add --no-cache ca-certificates tzdata mysql-client

WORKDIR /app
COPY --from=backend /out/presensi-pkbm /app/presensi-pkbm
COPY --from=frontend /src/dist /app/dist

RUN mkdir -p /var/lib/presensi-pkbm/backups \
    && chown -R app:app /var/lib/presensi-pkbm

ENV APP_ENV=production \
    APP_PORT=8080 \
    APP_TIMEZONE=Asia/Jakarta \
    STATIC_DIR=/app/dist \
    BACKUP_DIR=/var/lib/presensi-pkbm/backups \
    COOKIE_SECURE=true

USER app
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD wget -qO- http://127.0.0.1:8080/health/live >/dev/null || exit 1

ENTRYPOINT ["/app/presensi-pkbm"]
