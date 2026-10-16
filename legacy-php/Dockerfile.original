FROM node:20-alpine AS frontend
WORKDIR /app

ARG VITE_API_URL=/api
# VITE_GOOGLE_CLIENT_ID bersifat opsional (fallback). Sumber utama kini dari
# endpoint /api/google_config.php (runtime env GOOGLE_CLIENT_ID).
ARG VITE_GOOGLE_CLIENT_ID=
ENV VITE_API_URL=${VITE_API_URL}
ENV VITE_GOOGLE_CLIENT_ID=${VITE_GOOGLE_CLIENT_ID}

COPY package*.json ./
RUN npm ci

COPY index.html vite.config.js postcss.config.js tailwind.config.js ./
COPY public ./public
COPY src ./src
RUN npm run build

FROM dunglas/frankenphp:1-php8.2 AS runtime

RUN apt-get update \
    && apt-get install -y --no-install-recommends curl \
    && docker-php-ext-install pdo_mysql \
    && rm -rf /var/lib/apt/lists/*

ENV APP_ENV=production \
    APP_TIMEZONE=Asia/Jakarta

WORKDIR /app/public

COPY docker/Caddyfile /etc/frankenphp/Caddyfile
COPY docker/php-production.ini /usr/local/etc/php/conf.d/zz-production.ini
COPY --from=frontend /app/dist /var/www/html
COPY api /var/www/html/api

RUN rm -f \
        /var/www/html/api/debug_presensi.php \
        /var/www/html/api/debug_simple.php \
        /var/www/html/api/debug_workdays.php \
        /var/www/html/api/generate_password.php \
        /var/www/html/api/import_guru.php \
        /var/www/html/api/list_users_temp.php \
        /var/www/html/api/reset_password.php \
        /var/www/html/api/test.php \
        /var/www/html/api/test_direct_gowa.php \
    && mkdir -p /var/www/html/sessions /var/www/html/logs \
    && chown -R www-data:www-data /var/www/html/sessions /var/www/html/logs

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
    CMD curl -fsS http://127.0.0.1/api/health.php >/dev/null || exit 1
