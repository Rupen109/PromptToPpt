# Caddy with the Route 53 DNS plugin. The server only accepts CloudFront, so Let's Encrypt cannot reach it over HTTP: Caddy proves it owns the
# names by writing a temporary _acme-challenge TXT record in Route 53 instead (the server's IAM role may change only those records).
# Versions are pinned; caddy-dns/route53 1.6+ is required for Caddy 2.10 and later.
FROM caddy:2.11.7-builder-alpine AS build
RUN xcaddy build v2.11.7 --with github.com/caddy-dns/route53@v1.6.2

FROM caddy:2.11.7-alpine
COPY --from=build /usr/bin/caddy /usr/bin/caddy
