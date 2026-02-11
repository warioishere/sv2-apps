#!/bin/bash

# Validation script for JD-GUI project structure
# Run this before building to ensure all files are in place

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo "=== JD-GUI Project Validation ==="
echo ""

ERRORS=0
WARNINGS=0

check_file() {
    if [ -f "$1" ]; then
        echo -e "${GREEN}✓${NC} $1"
    else
        echo -e "${RED}✗${NC} $1 (missing)"
        ((ERRORS++))
    fi
}

check_dir() {
    if [ -d "$1" ]; then
        echo -e "${GREEN}✓${NC} $1/"
    else
        echo -e "${RED}✗${NC} $1/ (missing)"
        ((ERRORS++))
    fi
}

echo "Checking directory structure..."
check_dir "backend"
check_dir "backend/src"
check_dir "backend/src/controllers"
check_dir "backend/src/routes"
check_dir "backend/src/services"
check_dir "backend/src/websocket"
check_dir "backend/src/middleware"
check_dir "backend/src/utils"
check_dir "frontend"
check_dir "frontend/src"
check_dir "frontend/src/components"
check_dir "frontend/src/hooks"
check_dir "frontend/src/services"
check_dir "frontend/src/types"

echo ""
echo "Checking backend files..."
check_file "backend/package.json"
check_file "backend/tsconfig.json"
check_file "backend/Dockerfile"
check_file "backend/src/index.ts"
check_file "backend/src/controllers/config.controller.ts"
check_file "backend/src/controllers/jdc.controller.ts"
check_file "backend/src/routes/config.routes.ts"
check_file "backend/src/routes/jdc.routes.ts"
check_file "backend/src/routes/keys.routes.ts"
check_file "backend/src/services/process.service.ts"
check_file "backend/src/services/toml.service.ts"
check_file "backend/src/websocket/log-stream.ts"
check_file "backend/src/middleware/error.middleware.ts"
check_file "backend/src/middleware/ratelimit.middleware.ts"
check_file "backend/src/utils/logger.ts"

echo ""
echo "Checking frontend files..."
check_file "frontend/package.json"
check_file "frontend/tsconfig.json"
check_file "frontend/tsconfig.node.json"
check_file "frontend/vite.config.ts"
check_file "frontend/index.html"
check_file "frontend/src/main.tsx"
check_file "frontend/src/App.tsx"
check_file "frontend/src/App.css"
check_file "frontend/src/types/config.types.ts"
check_file "frontend/src/services/api.service.ts"
check_file "frontend/src/hooks/useLogStream.ts"
check_file "frontend/src/hooks/useJdcStatus.ts"
check_file "frontend/src/components/StatusPanel/StatusPanel.tsx"
check_file "frontend/src/components/StatusPanel/StatusPanel.css"
check_file "frontend/src/components/LogViewer/LogViewer.tsx"
check_file "frontend/src/components/LogViewer/LogViewer.css"
check_file "frontend/src/components/ConfigForm/ConfigForm.tsx"
check_file "frontend/src/components/ConfigForm/ConfigForm.css"
check_file "frontend/src/components/QuickStart/QuickStart.tsx"
check_file "frontend/src/components/QuickStart/QuickStart.css"

echo ""
echo "Checking Docker and config files..."
check_file "docker-compose.yml"
check_file ".gitignore"
check_file ".env.example"
check_file "README.md"
check_file "TESTING.md"

echo ""
echo "Checking parent directories (sv2-apps)..."
if [ -d "../../.." ]; then
    if [ -d "../../../libs" ]; then
        echo -e "${GREEN}✓${NC} ../../../libs/"
    else
        echo -e "${YELLOW}⚠${NC} ../../../libs/ (not found - Docker build may fail)"
        ((WARNINGS++))
    fi

    if [ -d "../../../protocols" ]; then
        echo -e "${GREEN}✓${NC} ../../../protocols/"
    else
        echo -e "${YELLOW}⚠${NC} ../../../protocols/ (not found - Docker build may fail)"
        ((WARNINGS++))
    fi

    if [ -d "../../../utils" ]; then
        echo -e "${GREEN}✓${NC} ../../../utils/"
    else
        echo -e "${YELLOW}⚠${NC} ../../../utils/ (not found - Docker build may fail)"
        ((WARNINGS++))
    fi

    if [ -f "../../../Cargo.toml" ]; then
        echo -e "${GREEN}✓${NC} ../../../Cargo.toml"
    else
        echo -e "${YELLOW}⚠${NC} ../../../Cargo.toml (not found - Docker build may fail)"
        ((WARNINGS++))
    fi
fi

echo ""
echo "==================================="

if [ $ERRORS -eq 0 ] && [ $WARNINGS -eq 0 ]; then
    echo -e "${GREEN}All checks passed!${NC}"
    echo ""
    echo "You can now build the project:"
    echo "  docker-compose build"
    exit 0
elif [ $ERRORS -eq 0 ]; then
    echo -e "${YELLOW}Validation completed with $WARNINGS warning(s)${NC}"
    echo ""
    echo "You can try to build, but it may fail:"
    echo "  docker-compose build"
    exit 0
else
    echo -e "${RED}Validation failed with $ERRORS error(s) and $WARNINGS warning(s)${NC}"
    echo ""
    echo "Please fix the errors before building."
    exit 1
fi
