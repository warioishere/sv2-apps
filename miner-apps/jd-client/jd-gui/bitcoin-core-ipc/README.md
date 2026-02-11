# Bitcoin Core with IPC/Multiprocess Support

Custom Bitcoin Core Docker image built with IPC (Inter-Process Communication) support for Stratum V2 Template Provider (sv2-tp).

## Why This Custom Build?

**Problem:** The official `bitcoin/bitcoin` Docker images do NOT include IPC/multiprocess support.

**Solution:** This custom image builds Bitcoin Core 30.2 from source with the `--enable-multiprocess` flag enabled.

## IPC Requirement

The sv2-tp (Stratum V2 Template Provider) **requires** Bitcoin Core with IPC support to function. sv2-tp connects to Bitcoin Core via a Unix socket (`node.sock`) using the libmultiprocess interface, which is not available in standard Bitcoin Core builds.

**Sources:**
- [Stratum v2 via IPC Mining Interface tracking issue](https://github.com/bitcoin/bitcoin/issues/31098)
- [Multiprocess bitcoin documentation](https://github.com/bitcoin/bitcoin/blob/master/doc/multiprocess.md)
- [Bitcoin Core PR Review - Multiprocess](https://bitcoincore.reviews/10102)

## What This Build Includes

1. **Bitcoin Core 30.2** - Latest stable release
2. **Cap'n Proto** - Required for IPC serialization
3. **libmultiprocess** - IPC library (included via depends system)
4. **IPC Socket** - Creates `/home/bitcoin/.bitcoin/ipc/node.sock`

## Build Process

The Dockerfile uses Bitcoin Core's depends system with `MULTIPROCESS=1`:

```bash
# Build dependencies with multiprocess support
make -C depends NO_QT=1 NO_WALLET=0 MULTIPROCESS=1

# Configure and build
./configure --enable-multiprocess
make bitcoind bitcoin-node
```

## Usage

The container automatically:
- Creates IPC socket directory at `/home/bitcoin/.bitcoin/ipc/`
- Starts `bitcoind` with `-ipcbind=unix:/home/bitcoin/.bitcoin/ipc/node.sock`
- Shares the socket via Docker volume `bitcoin-mainnet-ipc` or `bitcoin-testnet-ipc`

## Environment Variables

- `NETWORK` - Bitcoin network (mainnet, testnet4, testnet, signet, regtest)
- `RPC_USER` - RPC username (default: stratum)
- `RPC_PASSWORD` - RPC password (default: stratum123)

## Volume Mounts

The IPC socket is shared with sv2-tp via Docker volumes:

```yaml
volumes:
  - bitcoin-mainnet-ipc:/home/bitcoin/.bitcoin/ipc
```

sv2-tp mounts this as:

```yaml
volumes:
  - bitcoin-mainnet-ipc:/bitcoin-ipc-mainnet:ro
```

## Verification

Check if IPC is enabled:

```bash
# Enter the container
docker exec -it sv2-bitcoin-mainnet bash

# Check for IPC socket
ls -la /home/bitcoin/.bitcoin/ipc/node.sock

# Should show: srwxr-xr-x (socket file)
```

## Comparison: Standard vs IPC Build

| Feature | bitcoin/bitcoin:30.2 | sv2-bitcoin-core-ipc:30.2 |
|---------|---------------------|---------------------------|
| IPC Support | ❌ No | ✅ Yes |
| Multiprocess | ❌ No | ✅ Yes |
| sv2-tp Compatible | ❌ No | ✅ Yes |
| node.sock | ❌ Missing | ✅ Created |
| Build Size | ~50MB | ~200MB |
| Build Time | Pre-built | ~15-20 min |

## Security Notes

- Runs as non-root user (`bitcoin:bitcoin`)
- Minimal runtime dependencies
- Pruned blockchain (550MB) by default
- RPC access restricted to Docker network

## Troubleshooting

**Issue:** IPC socket not created

```bash
# Check bitcoind logs
docker logs sv2-bitcoin-mainnet

# Verify -ipcbind parameter
docker exec sv2-bitcoin-mainnet ps aux | grep bitcoind
```

**Issue:** sv2-tp can't connect

```bash
# Check socket permissions
docker exec sv2-bitcoin-mainnet ls -la /home/bitcoin/.bitcoin/ipc/node.sock

# Verify socket is accessible from sv2-tp
docker exec sv2-jd-gui ls -la /bitcoin-ipc-mainnet/node.sock
```

## Building

Build the image:

```bash
cd jd-gui
docker compose build bitcoin-core-mainnet
```

Or build directly:

```bash
cd bitcoin-core-ipc
docker build -t sv2-bitcoin-core-ipc:30.2 .
```

## License

Bitcoin Core is released under the MIT license. See Bitcoin Core repository for details.
