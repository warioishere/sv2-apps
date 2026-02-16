#!/bin/bash
set -e

RPC_USER="${RPC_USER:-stratum}"
RPC_PASSWORD="${RPC_PASSWORD:-stratum123}"
NETWORK="${NETWORK:-mainnet}"

# Determine config file path based on network
if [ "$NETWORK" = "mainnet" ]; then
    CONF_FILE="/home/bitcoin/.bitcoin/bitcoin.conf"
else
    CONF_FILE="/home/bitcoin/.bitcoin/$NETWORK/bitcoin.conf"
fi

# Setup as root
if [ "$(id -u)" = '0' ]; then
    mkdir -p /home/bitcoin/.bitcoin/ipc

    # Create network-specific directory if needed
    if [ "$NETWORK" != "mainnet" ]; then
        mkdir -p "/home/bitcoin/.bitcoin/$NETWORK"
    fi

    # Create default bitcoin.conf if it doesn't exist
    if [ ! -f "$CONF_FILE" ]; then
        echo "Creating default bitcoin.conf at $CONF_FILE..."

        if [ "$NETWORK" = "mainnet" ]; then
            # Mainnet: all settings at root level
            cat > "$CONF_FILE" <<EOF
# Bitcoin Core Configuration
# Network: mainnet
# Created by entrypoint.sh

# Server settings
server=1

# RPC settings
rpcuser=$RPC_USER
rpcpassword=$RPC_PASSWORD
rpcallowip=0.0.0.0/0
rpcbind=0.0.0.0

# IPC settings (required for Template Provider)
ipcbind=unix:/home/bitcoin/.bitcoin/ipc/node.sock

# Performance settings
prune=550
txindex=0
dbcache=450
maxmempool=300

# ZMQ settings
zmqpubhashblock=tcp://0.0.0.0:28332

# Additional settings (edit via GUI)
EOF
        else
            # Testnet/regtest/signet: use network-specific sections
            # Network name is already correct for section name (testnet4, regtest, signet)
            SECTION_NAME="$NETWORK"

            cat > "$CONF_FILE" <<EOF
# Bitcoin Core Configuration
# Network: $NETWORK
# Created by entrypoint.sh

# Global settings
server=1
chain=$NETWORK

# Network-specific settings
[$SECTION_NAME]
rpcuser=$RPC_USER
rpcpassword=$RPC_PASSWORD
rpcallowip=0.0.0.0/0
rpcbind=0.0.0.0
rpcport=$(if [ "$NETWORK" = "testnet4" ]; then echo 48332; elif [ "$NETWORK" = "regtest" ]; then echo 18443; elif [ "$NETWORK" = "signet" ]; then echo 38332; else echo 8332; fi)

# IPC settings (required for Template Provider)
ipcbind=unix:/home/bitcoin/.bitcoin/ipc/node.sock

# Performance settings
prune=550
txindex=0
dbcache=450
maxmempool=300

# ZMQ settings
zmqpubhashblock=tcp://0.0.0.0:28332

# Additional settings (edit via GUI)
EOF

            # Add regtest-specific settings
            if [ "$NETWORK" = "regtest" ]; then
                echo "fallbackfee=0.00001" >> "$CONF_FILE"
            fi
        fi
    fi

    chown -R bitcoin:bitcoin /home/bitcoin
    exec gosu bitcoin bitcoin-node "-conf=$CONF_FILE" "$@"
fi

exec bitcoin-node "-conf=$CONF_FILE" "$@"
