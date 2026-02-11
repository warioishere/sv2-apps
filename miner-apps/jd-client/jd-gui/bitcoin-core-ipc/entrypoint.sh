#!/bin/bash
set -e

RPC_USER="${RPC_USER:-stratum}"
RPC_PASSWORD="${RPC_PASSWORD:-stratum123}"
NETWORK="${NETWORK:-mainnet}"

BITCOIN_OPTS=(
    "-server=1"
    "-rpcuser=$RPC_USER"
    "-rpcpassword=$RPC_PASSWORD"
    "-rpcallowip=0.0.0.0/0"
    "-rpcbind=0.0.0.0"
    "-prune=550"
    "-txindex=0"
    "-zmqpubhashblock=tcp://0.0.0.0:28332"
    "-ipcbind=unix:/home/bitcoin/.bitcoin/ipc/node.sock"
)

case "$NETWORK" in
    mainnet)
        BITCOIN_OPTS+=("-chain=main")
        ;;
    testnet4)
        BITCOIN_OPTS+=("-chain=testnet4")
        ;;
    testnet)
        BITCOIN_OPTS+=("-chain=test")
        ;;
    signet)
        BITCOIN_OPTS+=("-chain=signet")
        ;;
    regtest)
        BITCOIN_OPTS+=("-chain=regtest")
        BITCOIN_OPTS+=("-fallbackfee=0.00001")
        ;;
    *)
        echo "Unknown network: $NETWORK"
        exit 1
        ;;
esac

if [ "$(id -u)" = '0' ]; then
    mkdir -p /home/bitcoin/.bitcoin/ipc
    chown -R bitcoin:bitcoin /home/bitcoin
    exec gosu bitcoin bitcoin-node "${BITCOIN_OPTS[@]}" "$@"
fi

exec bitcoin-node "${BITCOIN_OPTS[@]}" "$@"
