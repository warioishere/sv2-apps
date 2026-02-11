# Stratum V2 Apps - Experimental JD-Client GUI Fork

⚠️ **EXPERIMENTAL FORK** ⚠️

This is a fork of [stratum-mining/sv2-apps](https://github.com/stratum-mining/sv2-apps) focused on building an **experimental web-based GUI** for complete Stratum V2 mining stack management with full template control.

## What We're Building Here

This fork adds a **full-stack mining management interface** that makes Stratum V2 template sovereignty accessible to solo miners and small operations without requiring deep technical expertise.

### The Problem

Solo miners and small operations want the same level of control over their block templates as large mining pools, but the current Stratum V2 tooling requires:
- Manual TOML configuration
- CLI expertise
- Understanding of Bitcoin Core IPC
- Complex multi-process orchestration
- No visibility into what's happening

### Our Solution

A **one-click web GUI** that manages the entire mining stack:

```
┌─────────────────────────────────────────────────────────────┐
│                     Browser Interface                        │
│                   http://localhost:3000                      │
│         Setup Wizard • Live Logs • Process Control           │
└──────────────────────────┬──────────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────────┐
│                   Backend (Express/TypeScript)               │
│   • Auto-generates configs for JD-Client + sv2-tp           │
│   • Manages process lifecycle (start/stop/restart)          │
│   • WebSocket log streaming                                  │
│   • Bitcoin Core container orchestration                     │
└──────────────┬───────────────────────────┬───────────────────┘
               │                           │
       ┌───────▼────────┐         ┌────────▼─────────┐
       │  bc-manager    │         │   JD-Client      │
       │ (Docker API)   │         │  (Rust Binary)   │
       └───────┬────────┘         └────────┬─────────┘
               │                           │
       ┌───────▼──────────┐       ┌────────▼─────────┐
       │  Bitcoin Core    │◄──IPC─┤     sv2-tp       │
       │  30.2 Custom     │       │  (C++ Template   │
       │  Build with      │       │   Provider)      │
       │  Multiprocess    │       └──────────────────┘
       └──────────────────┘
```

## What Makes This Different

### Traditional Mining
```
Your Miner → Pool
              ↓
         Pool decides everything in your blocks
```

### With This Setup
```
Your Miner → JD-Client → sv2-tp → Bitcoin Core ← YOU control templates
                       ↓
                    Pool (validates only)
```

**YOU decide**:
- Which transactions go in blocks
- Transaction ordering
- Fee thresholds
- Custom coinbase data
- What NOT to include

## Key Features

### 🎯 What Works
- **Custom Bitcoin Core Build**: Bitcoin Core 30.2 with `--enable-multiprocess` for IPC support
- **sv2-tp Integration**: Stratum V2 Template Provider connecting via Unix socket IPC
- **Setup Wizard**: Auto-detects Bitcoin Core, generates all configs automatically
- **Live Monitoring**: Real-time logs with auto-refresh for Bitcoin Core, sv2-tp, and JD-Client
- **Process Management**: Start/stop/restart all components from web interface
- **Privilege Separation**: bc-manager isolates Docker socket access for security
- **One-Click Deployment**: `docker compose up` and access GUI at localhost:3000

### 🚧 What's Experimental
- Bitcoin Core built from source (15-20 min first time)
- Custom entrypoint scripts for privilege dropping
- Multi-container orchestration with complex dependencies
- IPC socket sharing between containers
- No production testing or hardening yet

### 📋 What's Planned
- Multiple configuration profiles
- Advanced sv2-tp settings UI
- Automated testing suite
- Performance metrics dashboard
- Mobile-responsive interface

## Technical Implementation

### Bitcoin Core with IPC Support

Standard `bitcoin/bitcoin` Docker images **do NOT include IPC support**. We build Bitcoin Core 30.2 from source with:

```dockerfile
# Build with depends system including Cap'n Proto
RUN make -C depends NO_QT=1 MULTIPROCESS=1

# Configure with CMake
RUN cmake -B build \
    --toolchain depends/x86_64-pc-linux-gnu/toolchain.cmake \
    -DBUILD_MULTIPROCESS=ON \
    -DENABLE_IPC=ON

# Build binaries
RUN cmake --build build
```

**Result**: `bitcoin-node` binary with IPC socket at `/home/bitcoin/.bitcoin/ipc/node.sock`

### sv2-tp (Stratum V2 Template Provider)

Uses the official C++ implementation from [stratum-mining/sv2-tp](https://github.com/stratum-mining/sv2-tp):

- Connects to Bitcoin Core via IPC Unix socket
- Translates Bitcoin Core IPC → Stratum V2 Template Distribution Protocol
- Serves block templates to JD-Client
- **No Bitcoin Core patches required** (works with vanilla 30+ with IPC enabled)

### Security Model

**Privilege Separation**:
- `bc-manager`: Python Flask API, only component with Docker socket access
- `jd-gui`: Express backend, no Docker access, calls bc-manager HTTP API
- All processes run as non-root users with `gosu` privilege dropping

**Network Isolation**:
- Internal Docker network for all component communication
- Only port 3000 (GUI) exposed to host
- Bitcoin Core RPC restricted to container network

## Quick Start

```bash
# Clone this fork
git clone https://github.com/YOUR-USERNAME/sv2-apps.git
cd sv2-apps

# Switch to experimental branch
git checkout experimental/jd-gui-full-stack

# Start the stack
cd miner-apps/jd-client/jd-gui
docker compose up -d

# Open GUI
xdg-open http://localhost:3000
```

**First Run**:
1. Click "Start Bitcoin Core" (builds from source, takes ~15-20 minutes first time)
2. Wait for blockchain sync (or use testnet for faster testing)
3. Configure Pool + JD-Server addresses in wizard
4. Click "Generate Full Stack Configuration"
5. Start sv2-tp and JD-Client
6. Point your miners to `your-server:34265`

**Subsequent Runs**: Instant startup using cached images.

## Project Structure

```
miner-apps/jd-client/jd-gui/
├── backend/                    # Express + TypeScript API
│   ├── src/controllers/        # Bitcoin Core, sv2-tp, JD-Client management
│   ├── src/services/           # Process lifecycle, config generation
│   └── Dockerfile              # Multi-stage: jd-client + sv2-tp + backend
├── frontend/                   # React + TypeScript + Vite
│   ├── src/components/
│   │   └── SetupWizard/        # Main configuration UI
│   └── vite.config.ts
├── bc-manager/                 # Python Flask for Docker API
│   └── app.py                  # Secure container lifecycle management
├── bitcoin-core-ipc/           # Custom Bitcoin Core build
│   ├── Dockerfile              # CMake with multiprocess support
│   └── entrypoint.sh           # gosu privilege dropping
└── docker-compose.yml          # Full stack orchestration
```

## Upstream Synchronization

This fork regularly merges updates from:
- **sv2-apps**: https://github.com/stratum-mining/sv2-apps (main branch synced)
- **sv2-tp**: https://github.com/stratum-mining/sv2-tp
- **Bitcoin Core**: https://github.com/bitcoin/bitcoin

**Branch Strategy**:
- `main`: Clean, tracks upstream sv2-apps
- `experimental/jd-gui-full-stack`: Our experimental GUI work

**Syncing workflow**:
```bash
# Update from upstream
git checkout main
git pull upstream main

# Merge into experimental
git checkout experimental/jd-gui-full-stack
git merge main
```

## Status: Experimental

🚧 **This is NOT production-ready software**

**Expect**:
- Breaking changes without notice
- Bugs and rough edges
- Incomplete documentation
- Evolving architecture

**This is for**:
- Developers experimenting with Stratum V2
- Solo miners who want template control
- Contributors pushing SV2 adoption forward
- Testing and feedback (not mainnet production use)

## Why We're Building This

**Mission**: Make Stratum V2 template sovereignty accessible to everyone.

Large mining pools have sophisticated infrastructure for custom template creation. Solo miners and small operations deserve the same power without needing:
- Deep Linux expertise
- Manual configuration file editing
- Understanding of complex networking
- Days of setup and debugging

**Goal**: Click "Start" and get full template control.

## Contributing

Contributions welcome! This is experimental software with frequent changes.

**Before contributing**:
1. Understand this is NOT production-ready
2. Test on testnet/regtest first
3. Document your changes
4. Follow existing patterns

**Areas needing help**:
- Testing on different platforms (macOS, Windows WSL2)
- UI/UX improvements
- Documentation
- Bug reports and fixes
- Performance optimization

## Documentation

- **Full Setup Guide**: [miner-apps/jd-client/jd-gui/README.md](miner-apps/jd-client/jd-gui/README.md)
- **Bitcoin Core IPC Build**: [miner-apps/jd-client/jd-gui/bitcoin-core-ipc/README.md](miner-apps/jd-client/jd-gui/bitcoin-core-ipc/README.md)
- **bc-manager API**: [miner-apps/jd-client/jd-gui/bc-manager/README.md](miner-apps/jd-client/jd-gui/bc-manager/README.md)

## Support & Community

- **Upstream Issues**: https://github.com/stratum-mining/sv2-apps/issues
- **Stratum V2 Discord**: https://discord.gg/stratumv2
- **Stratum V2 Docs**: https://stratumprotocol.org
- **Bitcoin Core Multiprocess**: https://github.com/bitcoin/bitcoin/blob/master/doc/multiprocess.md

## Original Repository

This is a fork of the official Stratum V2 Reference Implementation:

**Upstream**: https://github.com/stratum-mining/sv2-apps

For the stable, production-focused Stratum V2 implementation, use the upstream repository. This fork focuses specifically on experimental GUI tooling for template control.

## License

This software is licensed under Apache 2.0 or MIT, at your option (same as upstream).

## MSRV

Minimum Supported Rust Version: 1.85.0

---

**Built by miners, for miners. Pushing Stratum V2 template sovereignty forward.** 🚀⚡

> **Note**: This is experimental software. For production mining, use the official upstream repository until this project reaches stability.
