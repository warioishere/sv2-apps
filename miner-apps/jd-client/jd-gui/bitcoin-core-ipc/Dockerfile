# Bitcoin Core with IPC/Multiprocess Support
# Required for Stratum V2 Template Provider (sv2-tp)

FROM debian:bookworm-slim AS builder

# Install build dependencies
RUN apt-get update && apt-get install -y \
    git \
    build-essential \
    libtool \
    autotools-dev \
    automake \
    autoconf \
    pkg-config \
    bsdmainutils \
    python3 \
    libevent-dev \
    libboost-dev \
    libsqlite3-dev \
    libzmq3-dev \
    systemtap-sdt-dev \
    curl \
    wget \
    cmake \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /build

# Clone Bitcoin Core (version 30.2)
RUN git clone --depth 1 --branch v30.2 https://github.com/bitcoin/bitcoin.git .

# Build with multiprocess support using depends system
# This includes Cap'n Proto and libmultiprocess automatically
RUN make -C depends NO_QT=1 NO_WALLET=0 MULTIPROCESS=1 -j$(nproc)

# Bitcoin Core 30.2 uses CMake, not autotools
# Configure with CMake using the depends toolchain
RUN cmake -B build \
    --toolchain /build/depends/x86_64-pc-linux-gnu/toolchain.cmake \
    -DBUILD_TESTS=OFF \
    -DBUILD_BENCH=OFF \
    -DBUILD_FUZZ_BINARY=OFF \
    -DBUILD_MULTIPROCESS=ON \
    -DENABLE_IPC=ON

# Build bitcoind and bitcoin-node
RUN cmake --build build -j$(nproc)

# Find where CMake put the binaries
RUN echo "Listing build output:" && \
    find /build -name "bitcoind" -o -name "bitcoin-cli" -o -name "bitcoin-node" -o -name "bitcoin-util" | head -20

# Runtime stage
FROM debian:bookworm-slim

# Install runtime dependencies including gosu for privilege dropping
RUN apt-get update && apt-get install -y \
    gosu \
    libevent-2.1-7 \
    libboost-filesystem1.74.0 \
    libboost-thread1.74.0 \
    libsqlite3-0 \
    libzmq5 \
    && rm -rf /var/lib/apt/lists/*

# Copy binaries from builder (CMake builds to build/bin/)
COPY --from=builder /build/build/bin/bitcoind /usr/local/bin/
COPY --from=builder /build/build/bin/bitcoin-cli /usr/local/bin/
COPY --from=builder /build/build/bin/bitcoin-node /usr/local/bin/

# Copy Cap'n Proto libraries (required for IPC)
COPY --from=builder /build/depends/x86_64-pc-linux-gnu/lib/libcapnp*.so* /usr/local/lib/
COPY --from=builder /build/depends/x86_64-pc-linux-gnu/lib/libkj*.so* /usr/local/lib/
RUN ldconfig

# Create bitcoin user
RUN groupadd -r bitcoin && useradd -r -m -g bitcoin bitcoin

WORKDIR /home/bitcoin

# Expose ports
EXPOSE 8332 8333 18332 18333 48332 48333 28332 28333

# Health check
HEALTHCHECK --interval=30s --timeout=10s --retries=5 --start-period=60s \
    CMD bitcoin-cli -rpcuser=${RPC_USER:-stratum} -rpcpassword=${RPC_PASSWORD:-stratum123} getblockchaininfo || exit 1

# Entrypoint runs as root to set up directories, then switches to bitcoin user
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

ENTRYPOINT ["/entrypoint.sh"]
