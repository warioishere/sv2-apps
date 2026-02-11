# JD-Client Web GUI Manager (Experimental)

⚠️ **EXPERIMENTAL PROJECT** ⚠️

This is an experimental web-based GUI for managing Stratum V2 Job Declarator Client (jd-client) with full Bitcoin Core integration for solo miners and small mining operations who want **complete control over their block templates**.

## What We're Building

This project aims to make Stratum V2 template control accessible to everyone by providing:

- **Full Stack Mining Setup**: JD-Client + Bitcoin Core (with IPC) + sv2-tp (Template Provider) + GUI - all managed through a simple web interface
- **True Decentralization**: Solo miners get the same template control as large pools
- **One-Click Deployment**: No manual TOML editing, no CLI expertise required
- **Template Sovereignty**: You control what goes in your blocks

## Status: Experimental & Under Active Development

🚧 **This is NOT a production-ready solution**

We're pushing the boundaries of Stratum V2 adoption by:
- Building Bitcoin Core 30.2 with multiprocess/IPC support from source
- Integrating the standalone sv2-tp (Stratum V2 Template Provider)
- Creating an automated setup wizard for complex mining infrastructure
- Regularly updating from upstream sv2-apps repository

**Expect breaking changes, bugs, and rough edges.** This project is for:
- Developers experimenting with Stratum V2
- Solo miners who want template control
- Contributors pushing SV2 adoption forward

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        Browser GUI                           │
│                   http://localhost:3000                      │
└──────────────────────────┬──────────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────────┐
│                   Express Backend (Port 5000)                │
│   - Setup Wizard                                             │
│   - Process Management (JD-Client, sv2-tp, Bitcoin Core)    │
│   - Live Log Streaming                                       │
│   - Configuration Generation                                 │
└──────────────┬───────────────────────────┬───────────────────┘
               │                           │
       ┌───────▼────────┐         ┌────────▼─────────┐
       │  bc-manager    │         │     jd-client    │
       │ (Docker API)   │         │  (Rust binary)   │
       └───────┬────────┘         └────────┬─────────┘
               │                           │
       ┌───────▼──────────┐       ┌────────▼─────────┐
       │  Bitcoin Core    │◄──────┤     sv2-tp       │
       │  30.2 + IPC      │ IPC   │ (C++ Template    │
       │  (Multiprocess)  │       │   Provider)      │
       └──────────────────┘       └──────────────────┘
               │
       ┌───────▼──────────┐
       │   Blockchain     │
       │   (Mainnet/      │
       │    Testnet)      │
       └──────────────────┘
```

## Key Components

### 1. Bitcoin Core with IPC Support
- **Custom Build**: Bitcoin Core 30.2 compiled with `--enable-multiprocess` and `-DENABLE_IPC=ON`
- **Why**: Standard Bitcoin Core Docker images don't include IPC support needed by sv2-tp
- **Socket**: `/home/bitcoin/.bitcoin/ipc/node.sock` for template provider communication
- **Mode**: Pruned (550MB) by default to save disk space

### 2. sv2-tp (Stratum V2 Template Provider)
- **Source**: https://github.com/stratum-mining/sv2-tp (C++ implementation)
- **Purpose**: Translates Bitcoin Core IPC → Stratum V2 Template Distribution Protocol
- **Connection**: Connects to Bitcoin Core via Unix socket, serves templates to JD-Client
- **No Patches Required**: Works with vanilla Bitcoin Core 30+ with IPC enabled

### 3. JD-Client (Job Declarator Client)
- **Role**: Miners connect here (port 34265), declares custom jobs to pool
- **Mode**: Independent (full template control) or Aggregated
- **Template Source**: Gets templates from sv2-tp, not from pool

### 4. bc-manager (Privilege Separation)
- **Security**: Only service with Docker socket access
- **Purpose**: Manages Bitcoin Core container lifecycle via HTTP API
- **Isolation**: jd-gui calls bc-manager, never touches Docker directly

## Quick Start

### Prerequisites

- Docker 24.0+ with Compose
- 10GB free disk space (Bitcoin Core build + blockchain)
- Linux, macOS, or Windows with WSL2

### Installation

```bash
cd /path/to/sv2-apps/miner-apps/jd-client/jd-gui

# Start all services
docker compose up -d

# Watch logs (optional)
docker logs -f sv2-jd-gui
docker logs -f sv2-bc-manager
```

### Initial Setup

1. **Open GUI**: http://localhost:3000

2. **Bitcoin Core Setup** (Choose one):
   - **Option A**: Click "Start Bitcoin Core" to run integrated Docker Bitcoin Core
     - First time: Builds Bitcoin Core 30.2 with IPC (~15-20 minutes)
     - Subsequent starts: Instant
     - Live logs show sync progress
   - **Option B**: Use existing Bitcoin Core on host (must have IPC enabled)

3. **Configuration Wizard**:
   - Enter Pool address and JD-Server address
   - Set your mining identity
   - Enter Bitcoin address for coinbase rewards
   - Click "Generate Full Stack Configuration"

4. **Start Mining**:
   - GUI auto-generates configs for sv2-tp and jd-client
   - Click "Start Template Provider" → "Start JD-Client"
   - Point your miners to `your-server:34265`

## What Makes This Different?

### Traditional Mining:
```
Miner → Pool (pool controls templates)
```

### This Setup:
```
Miner → JD-Client → sv2-tp → Bitcoin Core (YOU control templates)
                  ↓
                Pool (just validates)
```

**You decide**:
- Which transactions go in blocks
- Transaction ordering
- Whether to include specific TXs
- Custom coinbase data

## Development Status

### ✅ Working
- Bitcoin Core 30.2 build with IPC/multiprocess
- sv2-tp integration and configuration
- Setup wizard with auto-detection
- Process lifecycle management
- Live log streaming with auto-refresh
- Docker Compose orchestration

### 🚧 In Progress
- Multiple configuration profiles
- Advanced sv2-tp settings UI
- Automated testing suite
- Production hardening

### 📋 Planned
- One-click updates from upstream
- Monitoring and alerting
- Performance metrics dashboard
- Mobile-responsive UI

## Upstream Synchronization

This project regularly merges updates from:
- **sv2-apps**: https://github.com/stratum-mining/sv2-apps
- **sv2-tp**: https://github.com/stratum-mining/sv2-tp
- **Bitcoin Core**: https://github.com/bitcoin/bitcoin

We track upstream changes and adapt the GUI integration accordingly.

## Security Model

### Privilege Separation
- **bc-manager**: Only component with Docker socket (minimal attack surface)
- **jd-gui**: No Docker access, calls bc-manager HTTP API
- **Bitcoin Core**: Runs as non-root user (bitcoin:bitcoin)
- **sv2-tp**: Runs as non-root user

### Network Isolation
- All services communicate via internal Docker network
- Only GUI port (3000) exposed to host
- Bitcoin Core RPC restricted to container network

### Data Persistence
- Named Docker volumes (outside repository)
- Bitcoin blockchain data: `bitcoin-mainnet-data` or `bitcoin-testnet-data`
- JD-Client configs: `jdc-config`
- Logs: `jdc-logs`, `sv2-tp-logs`

## Troubleshooting

### Build fails during Bitcoin Core compilation
```bash
# Check logs
docker logs sv2-bc-manager

# Clean rebuild
docker rmi sv2-bitcoin-core-ipc:30.2 -f
# Click "Start Bitcoin Core" in GUI to rebuild
```

### Permission denied errors
```bash
# Restart bc-manager
docker compose restart bc-manager
```

### Bitcoin Core not syncing
- Check GUI logs (click "Show Logs" → enable "Live View")
- Syncing can take hours/days depending on network
- Pruned mode (550MB) still needs to validate all blocks

### sv2-tp connection errors
- Ensure Bitcoin Core is fully synced
- Check IPC socket exists: `docker exec sv2-bitcoin-mainnet ls -la /home/bitcoin/.bitcoin/ipc/node.sock`
- Verify sv2-tp logs: Check GUI logs for sv2-tp

## Project Structure

```
jd-gui/
├── backend/                    # Express API + TypeScript
│   ├── src/
│   │   ├── controllers/        # API endpoints
│   │   │   ├── bitcoin.controller.ts    # Bitcoin Core management
│   │   │   ├── tp.controller.ts         # Template Provider control
│   │   │   ├── wizard.controller.ts     # Setup wizard logic
│   │   │   └── jdc.controller.ts        # JD-Client management
│   │   ├── services/
│   │   │   ├── jdc-process.service.ts   # JD-Client lifecycle
│   │   │   └── tp-process.service.ts    # sv2-tp lifecycle
│   │   └── routes/
│   └── Dockerfile              # Multi-stage: jd-client + sv2-tp + backend
├── frontend/                   # React + TypeScript + Vite
│   ├── src/
│   │   ├── components/
│   │   │   └── SetupWizard/    # Main configuration UI
│   │   └── services/
│   │       └── api.service.ts  # Backend API client
│   └── vite.config.ts
├── bc-manager/                 # Python Flask API
│   ├── app.py                  # Docker container management
│   └── Dockerfile
├── bitcoin-core-ipc/           # Custom Bitcoin Core build
│   ├── Dockerfile              # CMake build with multiprocess
│   ├── entrypoint.sh           # Permission handling with gosu
│   └── README.md               # Build documentation
└── docker-compose.yml          # Full stack orchestration
```

## Contributing

This is experimental software. Contributions welcome, but expect:
- Frequent breaking changes
- Code churn as we iterate
- Incomplete documentation
- Evolving architecture

**Before contributing**:
1. Understand this is NOT production-ready
2. Test on testnet/regtest first
3. Document your changes
4. Follow existing code patterns

## Support & Community

- **GitHub Issues**: https://github.com/stratum-mining/sv2-apps/issues
- **Stratum V2 Discord**: https://discord.gg/stratumv2
- **Bitcoin Core Multiprocess**: https://github.com/bitcoin/bitcoin/blob/master/doc/multiprocess.md

## License

Part of the Stratum V2 reference implementation. See main repository for license details.

---

**Built by miners, for miners. Pushing Stratum V2 adoption forward. 🚀**
