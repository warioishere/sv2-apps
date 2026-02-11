# Testing Guide - JD-Client Web GUI Manager

## Pre-Build Validation

Before building the Docker image, verify all files are in place:

```bash
cd /home/warioishere/github_repos/sv2-apps/miner-apps/jd-client/jd-gui

# Check directory structure
ls -la backend/src/
ls -la frontend/src/

# Verify key files exist
test -f backend/Dockerfile && echo "✓ Backend Dockerfile" || echo "✗ Backend Dockerfile missing"
test -f docker-compose.yml && echo "✓ docker-compose.yml" || echo "✗ docker-compose.yml missing"
test -f backend/package.json && echo "✓ Backend package.json" || echo "✗ Backend package.json missing"
test -f frontend/package.json && echo "✓ Frontend package.json" || echo "✗ Frontend package.json missing"
```

## Build and Start

### 1. Build the Docker Image

```bash
cd /home/warioishere/github_repos/sv2-apps/miner-apps/jd-client/jd-gui

# Build (this may take 10-20 minutes on first build)
docker-compose build

# Expected output:
# - Building jd-gui
# - [1/4] Building jd-client binary (Rust compilation)
# - [2/4] Building backend (TypeScript compilation)
# - [3/4] Building frontend (React build)
# - [4/4] Final runtime image
# - Successfully tagged jd-gui_jd-gui:latest
```

### 2. Start the Container

```bash
docker-compose up -d

# Verify container is running
docker ps | grep jd-gui

# Expected output:
# CONTAINER ID   IMAGE           STATUS         PORTS
# xxxxx          jd-gui_jd-gui   Up X seconds   0.0.0.0:3000->5000/tcp
```

### 3. Check Logs

```bash
# View container logs
docker-compose logs -f jd-gui

# Expected output:
# Server running on port 5000
# Environment: production
# WebSocket log streaming setup complete
```

## Functional Testing

### Test 1: GUI Access

```bash
# Open browser
xdg-open http://localhost:3000  # Linux
# or manually navigate to http://localhost:3000

# Expected:
# - Page loads without errors
# - Header shows "JD-Client Web GUI Manager"
# - Status panel shows "Stopped"
# - Three navigation tabs: Quick Start, Configuration, Logs
```

### Test 2: API Health Check

```bash
curl http://localhost:3000/api/health

# Expected output:
# {"status":"ok","timestamp":"2026-02-09T...","uptime":XXX}
```

### Test 3: Key Generation

```bash
curl -X POST http://localhost:3000/api/keys/generate

# Expected output:
# {
#   "success": true,
#   "keys": {
#     "public_key": "...",
#     "secret_key": "..."
#   }
# }
```

### Test 4: Configuration Validation

Create a test config:

```bash
cat > /tmp/test-config.json << 'EOF'
{
  "listening_address": "127.0.0.1:34255",
  "max_supported_version": 2,
  "min_supported_version": 2,
  "authority_public_key": "test_public_key_123456789012345678901234",
  "authority_secret_key": "test_secret_key_123456789012345678901234",
  "cert_validity_sec": 3600,
  "user_identity": "test-miner",
  "shares_per_minute": 60,
  "share_batch_size": 3,
  "mode": "independent",
  "jdc_signature": "deadbeef",
  "coinbase_reward_script": "76a914deadbeef88ac",
  "upstreams": [
    {
      "authority_pubkey": "test_pool_key_123456789012345678901234",
      "pool_address": "pool.example.com:3333"
    }
  ],
  "template_provider_type": "BitcoinCoreIpc",
  "bitcoin_core_ipc": {
    "network": "testnet4",
    "fee_threshold": 1000,
    "min_interval": 30
  }
}
EOF

curl -X POST http://localhost:3000/api/config/validate \
  -H "Content-Type: application/json" \
  -d @/tmp/test-config.json

# Expected output:
# {
#   "valid": true,
#   "toml": "listening_address = \"127.0.0.1:34255\"\n..."
# }
```

### Test 5: Configuration Save

```bash
curl -X POST http://localhost:3000/api/config \
  -H "Content-Type: application/json" \
  -d @/tmp/test-config.json

# Expected output:
# {
#   "success": true,
#   "message": "Configuration saved successfully",
#   "path": "/app/config/jdc.toml"
# }

# Verify config was saved
docker exec $(docker ps -q -f name=jd-gui) cat /app/config/jdc.toml
```

### Test 6: Process Control (Will Fail Without Valid Config)

```bash
# Try to start (will fail without valid pool config)
curl -X POST http://localhost:3000/api/jdc/start

# Expected output:
# {
#   "success": false,
#   "error": "Process failed to start"
# }

# Check status
curl http://localhost:3000/api/jdc/status

# Expected output:
# {"running":false}
```

### Test 7: WebSocket Log Streaming

Install `websocat` if not available:
```bash
# Ubuntu/Debian
sudo apt install websocat

# macOS
brew install websocat
```

Test WebSocket connection:
```bash
websocat ws://localhost:3000/api/jdc/logs

# Expected output:
# {"type":"status","running":false}
# (Connection stays open)
```

### Test 8: Frontend Validation (Browser Console)

Open http://localhost:3000 and open browser DevTools (F12):

1. **Quick Start Tab**:
   - Should show 5 steps
   - No console errors

2. **Configuration Tab**:
   - Navigate through all 6 tabs
   - Fill in "User Identity" field → verify input works
   - Click "Generate New Keys" → verify keys populate
   - Click "Add Upstream" → verify new upstream appears
   - Change "Template Provider Type" → verify conditional fields change

3. **Logs Tab**:
   - Should show "No logs to display"
   - WebSocket status should show "Connected" (green)
   - Try log level filter → verify dropdown works
   - Toggle "Auto-scroll" → verify checkbox works

## Integration Testing

### Full Configuration Workflow

Using the GUI (http://localhost:3000):

1. **Navigate to Configuration > Encryption**
   - Click "Generate New Keys"
   - Verify keys appear in the fields

2. **Navigate to Configuration > Basic Settings**
   - Leave default values

3. **Navigate to Configuration > Mining**
   - Enter user_identity: "test-miner"
   - Enter jdc_signature: "deadbeef"
   - Enter coinbase_reward_script: "76a914deadbeef88ac"

4. **Navigate to Configuration > Upstreams**
   - Enter pool_address: "pool.example.com:3333"
   - Enter authority_pubkey: "test_key_12345678901234567890"

5. **Navigate to Configuration > Template Provider**
   - Select "Bitcoin Core IPC"
   - Select Network: "Testnet4"

6. **Save Configuration**
   - Click "Validate" → should show success
   - Click "Save Configuration" → should show success message

7. **Navigate to Logs Tab**
   - Verify WebSocket connected
   - Verify "No logs to display" message

8. **Try to Start (will fail without real pool)**
   - Click "Start" in Status panel
   - Should show error message
   - Logs should appear in Logs tab

## Windows/WSL2 Testing

On Windows with Docker Desktop:

```powershell
# Navigate to project
cd C:\path\to\sv2-apps\miner-apps\jd-client\jd-gui

# Build and start
docker-compose up -d

# Open browser
start http://localhost:3000

# Check logs
docker-compose logs -f
```

## Performance Testing

### Build Time
```bash
time docker-compose build --no-cache

# Expected: 10-20 minutes (first build)
# Subsequent builds: 1-3 minutes (with cache)
```

### Image Size
```bash
docker images | grep jd-gui

# Expected: 400-600 MB (final image)
```

### Memory Usage
```bash
docker stats $(docker ps -q -f name=jd-gui)

# Expected: 50-100 MB (idle)
# Expected: 100-200 MB (jd-client running)
```

## Cleanup

```bash
# Stop and remove containers
docker-compose down

# Remove volumes (deletes saved configs)
docker-compose down -v

# Remove images
docker rmi jd-gui_jd-gui

# Clean up all
docker-compose down -v --rmi all
```

## Troubleshooting

### Build Fails at Rust Stage
```bash
# Check Rust version in container
docker run --rm rust:1.85-slim-bookworm rustc --version

# Verify capnproto is installed
docker run --rm rust:1.85-slim-bookworm sh -c "apt-get update && apt-get install -y capnproto && capnp --version"
```

### Frontend Not Loading
```bash
# Check if static files were built
docker exec $(docker ps -q -f name=jd-gui) ls -la /app/public/

# Expected: index.html, assets/, etc.
```

### API Calls Failing (CORS)
```bash
# Check CORS headers
curl -H "Origin: http://localhost:3000" \
  -H "Access-Control-Request-Method: POST" \
  -H "Access-Control-Request-Headers: Content-Type" \
  -X OPTIONS http://localhost:3000/api/health -v
```

### WebSocket Not Connecting
```bash
# Check WebSocket server
docker-compose logs jd-gui | grep -i websocket

# Expected: "WebSocket log streaming setup complete"
```

## Success Criteria

- [ ] Docker image builds without errors
- [ ] Container starts and stays running
- [ ] GUI loads at http://localhost:3000
- [ ] All 3 navigation tabs load without errors
- [ ] API health check returns 200 OK
- [ ] Key generation works
- [ ] Configuration validation works
- [ ] Configuration save works
- [ ] WebSocket connects and shows "Connected"
- [ ] Status panel shows correct state
- [ ] All form inputs work
- [ ] No console errors in browser DevTools
