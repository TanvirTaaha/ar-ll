# ---- Build stage (optional asset processing) ----
FROM node:20-alpine AS builder

# No build step needed for this static app,
# but this stage is here for future extensibility (e.g., minification).

WORKDIR /app
COPY src/ ./src/

# ---- Production stage ----
FROM nginx:1.25-alpine

LABEL maintainer="AR Hand Letter"
LABEL description="AR Hand Letter - Web-based augmented reality hand tracking"

# Remove default nginx content
RUN rm -rf /usr/share/nginx/html/*

# Copy custom nginx config
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf

# Copy static assets from builder
COPY --from=builder /app/src/ /usr/share/nginx/html/

# Expose port
EXPOSE 80

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD wget -qO- http://localhost/health || exit 1

# Run nginx in foreground
CMD ["nginx", "-g", "daemon off;"]
