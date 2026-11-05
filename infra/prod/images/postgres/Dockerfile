# Postgres 16 with WAL-G: every finished WAL segment is copied to the backups bucket (archive_command), plus a daily base backup,
# so the database can be restored to any minute of the last 14 days. Credentials come from the server's IAM role (instance metadata).
# Debian (glibc) image, because the WAL-G release binaries are built against glibc.
FROM postgres:16-bookworm

ARG WALG_VERSION=v3.0.9
# sha256 of wal-g-pg-22.04-aarch64.tar.gz for v3.0.9, from the release's published digest
ARG WALG_SHA256=20191a37ad091a880c25f4cc907e6f0deb7f12bdd8a53fd62dbc7fcbf2eac712

RUN set -eux; \
    apt-get update; apt-get install -y --no-install-recommends ca-certificates curl; \
    curl -fsSL -o /tmp/wal-g.tar.gz "https://github.com/wal-g/wal-g/releases/download/${WALG_VERSION}/wal-g-pg-22.04-aarch64.tar.gz"; \
    echo "${WALG_SHA256}  /tmp/wal-g.tar.gz" | sha256sum -c -; \
    tar -xzf /tmp/wal-g.tar.gz -C /tmp; \
    install -m 0755 /tmp/wal-g-pg-22.04-aarch64 /usr/local/bin/wal-g; \
    rm -rf /tmp/wal-g* /var/lib/apt/lists/*; \
    apt-get purge -y curl; apt-get autoremove -y; \
    wal-g --version
