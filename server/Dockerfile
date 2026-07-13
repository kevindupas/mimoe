FROM php:8.4-cli

RUN apt-get update && apt-get install -y --no-install-recommends \
        libpq-dev unzip git \
    && docker-php-ext-install pdo pdo_pgsql pcntl \
    && rm -rf /var/lib/apt/lists/*

# Limites pour les blobs images (uploads chiffrés en base64)
RUN { \
    echo "post_max_size=25M"; \
    echo "upload_max_filesize=25M"; \
    echo "memory_limit=256M"; \
  } > /usr/local/etc/php/conf.d/clipd.ini

COPY --from=composer:2 /usr/bin/composer /usr/bin/composer

WORKDIR /app
COPY . .
RUN composer install --no-dev --optimize-autoloader --no-interaction

EXPOSE 8000 8080
