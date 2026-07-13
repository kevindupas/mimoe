FROM php:8.4-cli

RUN apt-get update && apt-get install -y --no-install-recommends \
        libpq-dev unzip git \
    && docker-php-ext-install pdo pdo_pgsql pcntl \
    && rm -rf /var/lib/apt/lists/*

# Limits for image blobs (base64 encrypted uploads)
RUN { \
    echo "post_max_size=100M"; \
    echo "upload_max_filesize=100M"; \
    echo "memory_limit=512M"; \
  } > /usr/local/etc/php/conf.d/mimoe.ini

COPY --from=composer:2 /usr/bin/composer /usr/bin/composer

WORKDIR /app
COPY . .
RUN composer install --no-dev --optimize-autoloader --no-interaction

EXPOSE 8000 8080
