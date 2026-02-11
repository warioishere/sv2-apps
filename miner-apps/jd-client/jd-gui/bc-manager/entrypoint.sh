#!/bin/sh
set -e

# Get the GID of the Docker socket
DOCKER_SOCK_GID=$(stat -c '%g' /var/run/docker.sock)

# Create docker group with correct GID if it doesn't exist
if ! getent group docker > /dev/null 2>&1; then
    addgroup -g "$DOCKER_SOCK_GID" docker
elif [ "$(getent group docker | cut -d: -f3)" != "$DOCKER_SOCK_GID" ]; then
    # If docker group exists but has wrong GID, recreate it
    delgroup docker
    addgroup -g "$DOCKER_SOCK_GID" docker
fi

# Add bcmanager user to docker group if not already a member
if ! id -nG bcmanager | grep -qw docker; then
    addgroup bcmanager docker
fi

# Switch to bcmanager user and run the app
exec su-exec bcmanager python -u /app/app.py
