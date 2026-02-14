# ---- Build stage (optional asset processing) ----
FROM node:20-alpine AS builder

WORKDIR /app
COPY src/ ./src/

# ---- Production stage ----
FROM nginx:1.25-alpine

LABEL maintainer="AR Hand Letter"
LABEL description="AR Hand Letter - Web-based augmented reality hand tracking"

# Install openssl for self-signed cert generation
RUN apk add --no-cache openssl

# Remove default nginx content
RUN rm -rf /usr/share/nginx/html/*

# Create directory for SSL certs
RUN mkdir -p /etc/nginx/ssl

# Generate self-signed certificate (valid for 365 days)
# CN=localhost covers local testing. For mobile, users will accept the security warning.
RUN openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
    -keyout /etc/nginx/ssl/server.key \
    -out /etc/nginx/ssl/server.crt \
    -subj "/C=US/ST=State/L=City/O=ARHandLetter/OU=Dev/CN=localhost"

# Copy custom nginx config
COPY nginx/nginx.conf /etc/nginx/conf.d/default.conf

# Copy static assets from builder
COPY --from=builder /app/src/ /usr/share/nginx/html/

# Expose ports (HTTP and HTTPS)
EXPOSE 80 443

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD wget -qO- http://localhost/health || exit 1

# Run nginx in foreground
CMD ["nginx", "-g", "daemon off;"]
