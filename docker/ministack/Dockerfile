FROM python:3.12.10-slim-bookworm

ARG MINISTACK_VERSION=1.3.54

RUN pip install --no-cache-dir "ministack==${MINISTACK_VERSION}" && \
    groupadd --gid 10001 ministack && \
    useradd --uid 10001 --gid 10001 --no-create-home --shell /usr/sbin/nologin ministack && \
    mkdir -p /var/lib/ministack /tmp/ministack && \
    chown -R ministack:ministack /var/lib/ministack /tmp/ministack

ENV BIND_HOST=0.0.0.0 \
    GATEWAY_PORT=4566 \
    MINISTACK_HOST=ministack \
    MINISTACK_REGION=us-east-1 \
    PERSIST_STATE=1 \
    STATE_DIR=/var/lib/ministack \
    TMPDIR=/tmp/ministack

USER ministack

EXPOSE 4566

CMD ["python", "-m", "ministack"]
