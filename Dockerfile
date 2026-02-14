FROM nginx:1.25-alpine

LABEL maintainer="AR Hand Letter"
LABEL description="AR Hand Letter - Web-based AR hand tracking"

RUN apk add --no-cache openssl

RUN rm -rf /usr/share/nginx/html/* \
    && mkdir -p /etc/nginx/ssl

RUN openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
    -keyout /etc/nginx/ssl/server.key \
    -out /etc/nginx/ssl/server.crt \
    -subj "/C=US/ST=State/L=City/O=ARHandLetter/OU=Dev/CN=localhost"

COPY nginx/nginx.conf /etc/nginx/conf.d/default.conf
COPY src/ /usr/share/nginx/html/

EXPOSE 80 443

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD wget -qO- http://localhost/health || exit 1

CMD ["nginx", "-g", "daemon off;"]
