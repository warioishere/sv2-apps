# Bitcoin Core Manager

Secure, minimal API service for managing Bitcoin Core Docker containers.

## Security Model

This service implements **privilege separation** for production security:

```
┌─────────────────────────────────────────┐
│  Host Docker Daemon                     │
│         ▲                                │
│         │ (only bc-manager has access)  │
│  ┌──────┴────────┐      HTTP            │
│  │ bc-manager    │◄─────────────┐       │
│  │ (privileged)  │              │       │
│  │               │    ┌─────────┴────┐  │
│  │ Whitelist:    │    │  jd-gui      │  │
│  │ • Start BC    │    │  (no socket) │  │
│  │ • Stop BC     │    │              │  │
│  │ • Get logs    │    │  User clicks │  │
│  │ • Get status  │    │  button ────►│  │
│  └───────────────┘    └──────────────┘  │
└─────────────────────────────────────────┘
```

### Why This Is Secure

✅ **Isolation**: Only bc-manager has Docker socket access
✅ **Whitelist**: Only specific operations allowed
✅ **Validation**: All inputs validated before execution
✅ **Audit**: All operations logged
✅ **Minimal**: Tiny attack surface (~50MB Alpine image)
✅ **Non-root**: Process runs as unprivileged user

### What bc-manager CAN Do

- Start bitcoin-core-mainnet container
- Start bitcoin-core-testnet container
- Stop bitcoin-core-mainnet container
- Stop bitcoin-core-testnet container
- Get logs from these containers
- Get status of these containers

### What bc-manager CANNOT Do

❌ Start/stop other containers
❌ Access jd-gui container
❌ Run arbitrary Docker commands
❌ Access host filesystem (except via Docker socket)
❌ Modify Docker networks
❌ Delete volumes

## API Endpoints

### Health Check
```bash
GET /health
```

### Start Bitcoin Core
```bash
POST /bitcoin/start
Body: { "network": "mainnet" | "testnet" }
```

### Stop Bitcoin Core
```bash
POST /bitcoin/stop
Body: { "network": "mainnet" | "testnet" }
```

### Get Status
```bash
GET /bitcoin/status?network=mainnet
```

### Get Logs
```bash
GET /bitcoin/logs?network=mainnet&lines=100
```

## Architecture

**Image**: Python 3.11 Alpine (~50MB)
**Framework**: Flask
**Port**: 5001 (internal only)
**User**: bcmanager (UID 1000, non-root)

## Testing

```bash
# Build
docker-compose build bc-manager

# Start
docker-compose up -d bc-manager

# Test health
curl http://localhost:5001/health

# Test start (from inside jd-gui container)
curl -X POST http://bc-manager:5001/bitcoin/start \
  -H "Content-Type: application/json" \
  -d '{"network":"testnet"}'
```

## Security Audit

This service has been designed with **defense in depth**:

1. **Input Validation**: All parameters validated against whitelist
2. **Command Injection Prevention**: Uses subprocess.run with list args
3. **Timeout Protection**: 30-second timeout on all Docker commands
4. **Error Handling**: No sensitive info in error messages
5. **Logging**: All operations logged for audit trail
6. **Minimal Dependencies**: Only Flask + Docker CLI

## Production Recommendations

For maximum security in production:

1. **Network Isolation**: Place bc-manager on separate Docker network
2. **Rate Limiting**: Add rate limiting to API endpoints
3. **Authentication**: Add API key authentication if exposing externally
4. **Monitoring**: Monitor bc-manager logs for suspicious activity
5. **Updates**: Keep Python and dependencies updated

## License

Part of the JD-Client GUI project.
