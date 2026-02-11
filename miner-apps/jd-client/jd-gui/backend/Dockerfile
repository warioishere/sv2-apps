# Stage 1a: Build jd-client binary
FROM rust:1.85-slim-bookworm AS jd-builder

RUN apt-get update && apt-get install -y \
    curl \
    capnproto \
    libcapnp-dev \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /build

# Copy required workspace directories
# The build context is set to the sv2-apps root directory
COPY miner-apps /build/miner-apps
COPY bitcoin-core-sv2 /build/bitcoin-core-sv2
COPY stratum-apps /build/stratum-apps

# Build jd-client from the miner-apps workspace
WORKDIR /build/miner-apps/jd-client
RUN cargo build --release

# Stage 1b: Build sv2-tp (Template Provider)
FROM debian:bookworm-slim AS tp-builder

# sv2-tp version - can be overridden via docker-compose build arg
ARG SV2_TP_COMMIT=f4dfc9ed004cb455e3f5e99f4b533e583b3d3dd3

RUN apt-get update && apt-get install -y \
    git \
    cmake \
    build-essential \
    libboost-all-dev \
    wget \
    autoconf \
    automake \
    libtool \
    pkg-config \
    && rm -rf /var/lib/apt/lists/*

# Build Cap'n Proto from source (version 1.0.2 required by sv2-tp)
WORKDIR /capnproto
RUN wget https://capnproto.org/capnproto-c++-1.0.2.tar.gz \
    && tar -xzf capnproto-c++-1.0.2.tar.gz \
    && cd capnproto-c++-1.0.2 \
    && ./configure \
    && make -j$(nproc) check \
    && make install \
    && ldconfig

# Clone and build sv2-tp
WORKDIR /sv2-tp
RUN git clone https://github.com/stratum-mining/sv2-tp.git . \
    && echo "Checking out sv2-tp commit: ${SV2_TP_COMMIT}" \
    && git checkout ${SV2_TP_COMMIT} \
    && git submodule update --init --recursive \
    && mkdir build \
    && cd build \
    && cmake .. \
    && make -j$(nproc)

# Stage 2: Build backend TypeScript
FROM node:20-slim AS backend-builder

WORKDIR /app/backend

# Install build dependencies for better-sqlite3
RUN apt-get update && apt-get install -y \
    python3 \
    make \
    g++ \
    && rm -rf /var/lib/apt/lists/*

COPY miner-apps/jd-client/jd-gui/backend/package*.json ./
RUN npm install

COPY miner-apps/jd-client/jd-gui/backend/ ./
RUN npm run build

# Stage 3: Build frontend React app
FROM node:20-slim AS frontend-builder

WORKDIR /app/frontend

COPY miner-apps/jd-client/jd-gui/frontend/package*.json ./
RUN npm install

COPY miner-apps/jd-client/jd-gui/frontend/ ./
RUN npm run build

# Stage 4: Final runtime image (use Debian to match Rust binary and sv2-tp)
FROM node:20-slim

WORKDIR /app

# Install runtime dependencies including git and docker CLI for updates
RUN apt-get update && apt-get install -y \
    wget \
    git \
    ca-certificates \
    curl \
    gnupg \
    lsb-release \
    libboost-system1.74.0 \
    libboost-filesystem1.74.0 \
    libboost-program-options1.74.0 \
    && mkdir -p /etc/apt/keyrings \
    && curl -fsSL https://download.docker.com/linux/debian/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg \
    && echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/debian $(lsb_release -cs) stable" | tee /etc/apt/sources.list.d/docker.list > /dev/null \
    && apt-get update \
    && apt-get install -y docker-ce-cli docker-compose-plugin \
    && rm -rf /var/lib/apt/lists/*

# Copy Cap'n Proto libraries from tp-builder (built from source)
COPY --from=tp-builder /usr/local/lib/libcapnp*.so* /usr/local/lib/
COPY --from=tp-builder /usr/local/lib/libkj*.so* /usr/local/lib/
RUN ldconfig

# Configure git to trust all directories (container is isolated)
RUN git config --global --add safe.directory '*'

# Copy jd-client binary (from workspace target directory)
COPY --from=jd-builder /build/miner-apps/target/release/jd_client_sv2 /app/jd_client_sv2

# Copy sv2-tp binary - search in common CMake build locations
RUN --mount=type=bind,from=tp-builder,source=/sv2-tp/build,target=/tmp/build \
    find /tmp/build -name "sv2-tp" -type f -executable -exec cp {} /app/sv2-tp \; && \
    chmod +x /app/sv2-tp

# Copy backend
COPY --from=backend-builder /app/backend/node_modules ./node_modules
COPY --from=backend-builder /app/backend/dist ./dist

# Copy frontend build
COPY --from=frontend-builder /app/frontend/dist ./public

# Copy config examples
COPY miner-apps/jd-client/config-examples /app/config-examples

# Create directories
RUN mkdir -p /app/config /app/logs /app/data /app/backups /app/config/instances /app/config/sv2-tp /app/logs/sv2-tp

# Expose port
EXPOSE 5000

# Start backend server
CMD ["node", "dist/index.js"]
