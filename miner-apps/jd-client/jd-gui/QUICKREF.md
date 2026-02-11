# Quick Reference - JD-Client Web GUI Manager

## Fast Commands

```bash
# Navigate to project
cd /home/warioishere/github_repos/sv2-apps/miner-apps/jd-client/jd-gui

# Validate structure
./validate.sh

# Build
docker-compose build

# Start
docker-compose up -d

# Logs
docker-compose logs -f jd-gui

# Stop
docker-compose down

# Rebuild from scratch
docker-compose down -v --rmi all && docker-compose build && docker-compose up -d
```

## URLs

- **GUI**: http://localhost:3000
- **API Health**: http://localhost:3000/api/health
- **WebSocket**: ws://localhost:3000/api/jdc/logs

## API Endpoints

```bash
# Health check
curl http://localhost:3000/api/health

# Generate keys
curl -X POST http://localhost:3000/api/keys/generate

# Validate config
curl -X POST http://localhost:3000/api/config/validate \
  -H "Content-Type: application/json" \
  -d @config.json

# Save config
curl -X POST http://localhost:3000/api/config \
  -H "Content-Type: application/json" \
  -d @config.json

# Start jd-client
curl -X POST http://localhost:3000/api/jdc/start

# Stop jd-client
curl -X POST http://localhost:3000/api/jdc/stop

# Get status
curl http://localhost:3000/api/jdc/status

# Get logs
curl http://localhost:3000/api/jdc/logs?count=100
```

## File Locations (in container)

```
/app/jd_client_sv2          # Binary
/app/config/jdc.toml        # Config file
/app/logs/                  # Log directory
/app/dist/                  # Backend JS
/app/public/                # Frontend static files
```

## Docker Commands

```bash
# Enter container
docker exec -it $(docker ps -q -f name=jd-gui) sh

# View config
docker exec $(docker ps -q -f name=jd-gui) cat /app/config/jdc.toml

# View logs directory
docker exec $(docker ps -q -f name=jd-gui) ls -la /app/logs/

# Check if jd-client binary exists
docker exec $(docker ps -q -f name=jd-gui) ls -lh /app/jd_client_sv2

# Check disk usage
docker system df

# Clean up everything
docker system prune -a --volumes
```

## Troubleshooting

### Build fails
```bash
# Check build logs
docker-compose build --no-cache 2>&1 | tee build.log

# Check Rust stage
docker build --target jd-builder -f backend/Dockerfile /home/warioishere/github_repos/sv2-apps

# Check backend stage
docker build --target backend-builder -f backend/Dockerfile /home/warioishere/github_repos/sv2-apps

# Check frontend stage
docker build --target frontend-builder -f backend/Dockerfile /home/warioishere/github_repos/sv2-apps
```

### Container won't start
```bash
# Check logs
docker-compose logs jd-gui

# Check container status
docker ps -a | grep jd-gui

# Inspect container
docker inspect $(docker ps -a -q -f name=jd-gui)
```

### Port already in use
```bash
# Find process using port 3000
sudo lsof -i :3000

# Or use different port in docker-compose.yml
# ports:
#   - "8080:5000"
```

### WebSocket won't connect
```bash
# Test WebSocket with websocat
websocat ws://localhost:3000/api/jdc/logs

# Check browser console for errors
# Chrome DevTools -> Network -> WS tab
```

### Config not saving
```bash
# Check volume
docker volume inspect jd-gui_jdc-config

# Check permissions in container
docker exec $(docker ps -q -f name=jd-gui) ls -la /app/config/
```

## Development Mode

### Backend only
```bash
cd backend
npm install
npm run dev
# Runs on port 5000
```

### Frontend only
```bash
cd frontend
npm install
npm run dev
# Runs on port 3000, proxies API to 5000
```

### Both (two terminals)
```bash
# Terminal 1
cd backend && npm run dev

# Terminal 2
cd frontend && npm run dev
```

## Project Structure

```
jd-gui/
├── backend/              # Express + WebSocket server
│   ├── src/
│   │   ├── index.ts                   # Main server
│   │   ├── controllers/               # Request handlers
│   │   ├── routes/                    # API routes
│   │   ├── services/                  # Business logic
│   │   │   ├── process.service.ts     # Process manager ⭐
│   │   │   └── toml.service.ts        # TOML generator ⭐
│   │   ├── websocket/
│   │   │   └── log-stream.ts          # Log streaming ⭐
│   │   ├── middleware/
│   │   └── utils/
│   ├── Dockerfile
│   └── package.json
│
├── frontend/             # React SPA
│   ├── src/
│   │   ├── components/
│   │   │   ├── ConfigForm/            # Config UI ⭐
│   │   │   ├── StatusPanel/           # Process control ⭐
│   │   │   ├── LogViewer/             # Logs UI ⭐
│   │   │   └── QuickStart/
│   │   ├── hooks/
│   │   │   ├── useLogStream.ts        # WebSocket hook ⭐
│   │   │   └── useJdcStatus.ts
│   │   ├── services/
│   │   │   └── api.service.ts         # API client
│   │   └── types/
│   ├── vite.config.ts
│   └── package.json
│
├── docker-compose.yml
├── README.md
├── TESTING.md
├── IMPLEMENTATION.md
└── validate.sh
```

## Common Issues

| Issue | Solution |
|-------|----------|
| Port 3000 in use | Change port in docker-compose.yml |
| Build timeout | Increase Docker build timeout |
| Out of disk space | Run `docker system prune -a` |
| WebSocket disconnects | Check firewall, ensure port 3000 open |
| Config validation fails | Check TESTING.md for valid config example |
| jd-client won't start | Check logs: `docker-compose logs -f` |

## Key Files

⭐ = Critical implementation

- `backend/src/services/process.service.ts` - Process lifecycle
- `backend/src/services/toml.service.ts` - Config generation
- `backend/src/websocket/log-stream.ts` - Real-time logs
- `frontend/src/components/ConfigForm/ConfigForm.tsx` - Config UI
- `frontend/src/components/LogViewer/LogViewer.tsx` - Logs UI
- `frontend/src/hooks/useLogStream.ts` - WebSocket client

## Resources

- README.md - Full documentation
- TESTING.md - Testing guide
- IMPLEMENTATION.md - Technical details
- validate.sh - Pre-build validation
