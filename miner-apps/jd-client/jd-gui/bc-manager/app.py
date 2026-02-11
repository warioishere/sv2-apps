#!/usr/bin/env python3
"""
Bitcoin Core Manager - Secure Docker Management API
Provides controlled access to Bitcoin Core container management
"""

from flask import Flask, request, jsonify
import subprocess
import json
import logging
from typing import Dict, Any

app = Flask(__name__)
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Track build state
BUILD_STATE = {
    'mainnet': {'building': False, 'message': ''},
    'testnet': {'building': False, 'message': ''}
}

# Security: Whitelist of allowed operations
ALLOWED_NETWORKS = ['mainnet', 'testnet']
ALLOWED_CONTAINERS = {
    'mainnet': 'sv2-bitcoin-mainnet',
    'testnet': 'sv2-bitcoin-testnet'
}
ALLOWED_SERVICES = {
    'mainnet': 'bitcoin-core-mainnet',
    'testnet': 'bitcoin-core-testnet'
}
ALLOWED_PROFILES = {
    'mainnet': 'bitcoin-mainnet',
    'testnet': 'bitcoin-testnet'
}

COMPOSE_FILE = '/repo/miner-apps/jd-client/jd-gui/docker-compose.yml'


def run_command(cmd: list[str], timeout: int = 30) -> Dict[str, Any]:
    """Execute command and return result"""
    try:
        logger.info(f"Executing: {' '.join(cmd)}")
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=timeout
        )

        # Log output for debugging
        if result.stdout:
            logger.debug(f"stdout: {result.stdout[:500]}")
        if result.stderr:
            logger.debug(f"stderr: {result.stderr[:500]}")

        return {
            'success': result.returncode == 0,
            'stdout': result.stdout,
            'stderr': result.stderr,
            'returncode': result.returncode
        }
    except subprocess.TimeoutExpired:
        logger.error(f"Command timed out after {timeout} seconds")
        return {
            'success': False,
            'error': f'Command timed out after {timeout} seconds. This may indicate image is building in background.'
        }
    except Exception as e:
        logger.error(f"Command failed: {str(e)}")
        return {
            'success': False,
            'error': str(e)
        }


@app.route('/health', methods=['GET'])
def health():
    """Health check endpoint"""
    return jsonify({'status': 'ok', 'service': 'bc-manager'})


@app.route('/bitcoin/start', methods=['POST'])
def start_bitcoin():
    """Start Bitcoin Core container (builds image if needed)"""
    data = request.get_json() or {}
    network = data.get('network', '').lower()

    # Validation
    if network not in ALLOWED_NETWORKS:
        logger.warning(f"Invalid network requested: {network}")
        return jsonify({
            'success': False,
            'error': f'Invalid network. Must be one of: {", ".join(ALLOWED_NETWORKS)}'
        }), 400

    profile = ALLOWED_PROFILES[network]
    service = ALLOWED_SERVICES[network]

    # Check if Bitcoin Core IPC image exists
    image_check = run_command(['docker', 'images', '-q', 'sv2-bitcoin-core-ipc:30.2'])
    image_exists = bool(image_check.get('stdout', '').strip())

    if not image_exists:
        logger.info(f"Bitcoin Core IPC image not found. Building it now (takes ~15-20 minutes)...")

        # Set build state
        BUILD_STATE[network]['building'] = True
        BUILD_STATE[network]['message'] = 'Building Bitcoin Core IPC image (takes ~15-20 minutes)'

        # Return immediately to avoid timeout, build happens in background
        # Start build process in background with streaming logs
        import threading
        import subprocess

        def build_and_start():
            try:
                logger.info(f"Building Bitcoin Core IPC image for {network}...")
                logger.info("=" * 80)
                logger.info("BUILD STARTED")
                logger.info("=" * 80)

                build_cmd = [
                    'docker', 'compose',
                    '-f', COMPOSE_FILE,
                    'build',
                    service
                ]

                # Run with streaming output (no capture)
                process = subprocess.Popen(
                    build_cmd,
                    stdout=subprocess.PIPE,
                    stderr=subprocess.STDOUT,
                    text=True,
                    bufsize=1
                )

                # Stream output to logs
                for line in iter(process.stdout.readline, ''):
                    if line:
                        logger.info(f"[BUILD] {line.rstrip()}")

                process.wait()

                if process.returncode == 0:
                    logger.info("=" * 80)
                    logger.info("BUILD COMPLETE! Starting container...")
                    logger.info("=" * 80)

                    # Update build state
                    BUILD_STATE[network]['building'] = False
                    BUILD_STATE[network]['message'] = 'Build complete, starting container...'

                    start_cmd = [
                        'docker', 'compose',
                        '-f', COMPOSE_FILE,
                        '--profile', profile,
                        'up', '-d', service
                    ]
                    start_result = run_command(start_cmd, timeout=120)

                    if start_result['success']:
                        logger.info(f"Bitcoin Core {network} started successfully!")
                        BUILD_STATE[network]['message'] = ''
                    else:
                        logger.error(f"Failed to start: {start_result.get('stderr')}")
                        BUILD_STATE[network]['message'] = f"Start failed: {start_result.get('stderr')}"
                else:
                    logger.error(f"Build failed with exit code {process.returncode}")
                    BUILD_STATE[network]['building'] = False
                    BUILD_STATE[network]['message'] = f'Build failed with exit code {process.returncode}'

            except Exception as e:
                logger.error(f"Build error: {str(e)}")
                BUILD_STATE[network]['building'] = False
                BUILD_STATE[network]['message'] = f'Build error: {str(e)}'

        # Start build in background thread
        build_thread = threading.Thread(target=build_and_start, daemon=True)
        build_thread.start()

        return jsonify({
            'success': True,
            'message': f'Building Bitcoin Core IPC image (takes ~15-20 minutes). Container will start automatically when build completes.',
            'building': True
        })

    logger.info(f"Starting Bitcoin Core {network}...")

    # Image exists, just start it
    cmd = [
        'docker', 'compose',
        '-f', COMPOSE_FILE,
        '--profile', profile,
        'up', '-d', service
    ]

    result = run_command(cmd, timeout=120)

    if result['success']:
        logger.info(f"Bitcoin Core {network} started successfully")
        return jsonify({
            'success': True,
            'message': f'Bitcoin Core {network} started successfully'
        })
    else:
        logger.error(f"Failed to start Bitcoin Core {network}: {result.get('stderr')}")
        return jsonify({
            'success': False,
            'error': result.get('stderr') or result.get('error', 'Unknown error')
        }), 500


@app.route('/bitcoin/stop', methods=['POST'])
def stop_bitcoin():
    """Stop Bitcoin Core container"""
    data = request.get_json() or {}
    network = data.get('network', '').lower()

    # Validation
    if network not in ALLOWED_NETWORKS:
        logger.warning(f"Invalid network requested: {network}")
        return jsonify({
            'success': False,
            'error': f'Invalid network. Must be one of: {", ".join(ALLOWED_NETWORKS)}'
        }), 400

    container = ALLOWED_CONTAINERS[network]

    logger.info(f"Stopping Bitcoin Core {network}...")

    # Stop and remove container
    stop_result = run_command(['docker', 'stop', container])
    rm_result = run_command(['docker', 'rm', container])

    if stop_result['success']:
        logger.info(f"Bitcoin Core {network} stopped successfully")
        return jsonify({
            'success': True,
            'message': f'Bitcoin Core {network} stopped successfully'
        })
    else:
        logger.error(f"Failed to stop Bitcoin Core {network}: {stop_result.get('stderr')}")
        return jsonify({
            'success': False,
            'error': stop_result.get('stderr') or stop_result.get('error', 'Unknown error')
        }), 500


@app.route('/bitcoin/status', methods=['GET'])
def get_status():
    """Get Bitcoin Core container status"""
    network = request.args.get('network', '').lower()

    # Validation
    if network not in ALLOWED_NETWORKS:
        return jsonify({
            'success': False,
            'error': f'Invalid network. Must be one of: {", ".join(ALLOWED_NETWORKS)}'
        }), 400

    container = ALLOWED_CONTAINERS[network]

    # Check BUILD_STATE first (most accurate)
    if BUILD_STATE[network]['building']:
        logger.info(f"Status check: {network} is building")
        return jsonify({
            'success': True,
            'running': False,
            'building': True,
            'message': BUILD_STATE[network]['message'],
            'network': network,
            'container': container
        })

    # Check if container exists and is running
    inspect_cmd = ['docker', 'inspect', container, '--format', '{{json .}}']
    result = run_command(inspect_cmd)

    if result['success'] and result['stdout']:
        try:
            container_info = json.loads(result['stdout'])
            state = container_info.get('State', {})

            return jsonify({
                'success': True,
                'running': state.get('Running', False),
                'network': network,
                'container': container,
                'building': False
            })
        except json.JSONDecodeError:
            pass

    # Container doesn't exist and not building
    return jsonify({
        'success': True,
        'running': False,
        'building': False,
        'network': network,
        'container': container
    })


@app.route('/bitcoin/logs', methods=['GET'])
def get_logs():
    """Get Bitcoin Core container logs"""
    network = request.args.get('network', '').lower()
    lines = request.args.get('lines', '100')

    # Validation
    if network not in ALLOWED_NETWORKS:
        return jsonify({
            'success': False,
            'error': f'Invalid network. Must be one of: {", ".join(ALLOWED_NETWORKS)}'
        }), 400

    try:
        lines_int = int(lines)
        if lines_int < 1 or lines_int > 10000:
            raise ValueError("Lines must be between 1 and 10000")
    except ValueError as e:
        return jsonify({
            'success': False,
            'error': f'Invalid lines parameter: {str(e)}'
        }), 400

    container = ALLOWED_CONTAINERS[network]

    # Get container logs
    cmd = ['docker', 'logs', '--tail', str(lines_int), container]
    result = run_command(cmd)

    if result['success']:
        logs = result['stdout'] + result['stderr']  # Combine stdout and stderr
        return jsonify({
            'success': True,
            'logs': logs,
            'network': network
        })
    else:
        return jsonify({
            'success': False,
            'error': result.get('error', 'Failed to get logs')
        }), 500


@app.route('/bitcoin/blockchain-info', methods=['GET'])
def get_blockchain_info():
    """Get Bitcoin Core blockchain sync status via RPC"""
    network = request.args.get('network', '').lower()

    # Validation
    if network not in ALLOWED_NETWORKS:
        return jsonify({
            'success': False,
            'error': f'Invalid network. Must be one of: {", ".join(ALLOWED_NETWORKS)}'
        }), 400

    container = ALLOWED_CONTAINERS[network]

    # Call bitcoin-cli getblockchaininfo
    rpc_args = ['-rpcuser=stratum', '-rpcpassword=stratum123']
    if network == 'testnet':
        rpc_args.append('-testnet4')

    cmd = ['docker', 'exec', container, 'bitcoin-cli'] + rpc_args + ['getblockchaininfo']
    result = run_command(cmd)

    if result['success'] and result['stdout']:
        try:
            info = json.loads(result['stdout'])
            return jsonify({
                'success': True,
                'blocks': info.get('blocks', 0),
                'headers': info.get('headers', 0),
                'verification_progress': info.get('verificationprogress', 0),
                'initial_block_download': info.get('initialblockdownload', True),
                'chain': info.get('chain', network),
                'network': network
            })
        except json.JSONDecodeError:
            logger.error(f"Failed to parse blockchain info: {result['stdout']}")

    return jsonify({
        'success': False,
        'error': 'Failed to get blockchain info',
        'details': result.get('stderr', '')
    }), 500


@app.route('/bitcoin/restart', methods=['POST'])
def restart_bitcoin():
    """Restart Bitcoin Core container"""
    data = request.get_json() or {}
    network = data.get('network', '').lower()

    # Validation
    if network not in ALLOWED_NETWORKS:
        logger.warning(f"Invalid network requested: {network}")
        return jsonify({
            'success': False,
            'error': f'Invalid network. Must be one of: {", ".join(ALLOWED_NETWORKS)}'
        }), 400

    container = ALLOWED_CONTAINERS[network]

    logger.info(f"Restarting Bitcoin Core {network}...")

    # Restart container
    restart_result = run_command(['docker', 'restart', container], timeout=60)

    if restart_result['success']:
        logger.info(f"Bitcoin Core {network} restarted successfully")
        return jsonify({
            'success': True,
            'message': f'Bitcoin Core {network} restarted successfully'
        })
    else:
        logger.error(f"Failed to restart Bitcoin Core {network}: {restart_result.get('stderr')}")
        return jsonify({
            'success': False,
            'error': restart_result.get('stderr') or restart_result.get('error', 'Unknown error')
        }), 500


@app.route('/bitcoin/config', methods=['GET'])
def get_config():
    """Get bitcoin.conf content from container"""
    network = request.args.get('network', '').lower()

    # Validation
    if network not in ALLOWED_NETWORKS:
        return jsonify({
            'success': False,
            'error': f'Invalid network. Must be one of: {", ".join(ALLOWED_NETWORKS)}'
        }), 400

    container = ALLOWED_CONTAINERS[network]

    # Determine config path based on network
    if network == 'mainnet':
        config_path = '/home/bitcoin/.bitcoin/bitcoin.conf'
    else:
        config_path = f'/home/bitcoin/.bitcoin/testnet4/bitcoin.conf'

    # Read config file from container
    cmd = ['docker', 'exec', container, 'cat', config_path]
    result = run_command(cmd)

    if result['success']:
        return jsonify({
            'success': True,
            'config': result['stdout'],
            'network': network,
            'path': config_path
        })
    else:
        # Config file doesn't exist yet (container needs restart with new entrypoint)
        return jsonify({
            'success': False,
            'error': 'bitcoin.conf not found. Please rebuild the Bitcoin Core container to enable config file support.',
            'needs_rebuild': True
        }), 404


@app.route('/bitcoin/config', methods=['POST'])
def update_config():
    """Update bitcoin.conf in container"""
    data = request.get_json() or {}
    network = data.get('network', '').lower()
    config_content = data.get('config', '')

    # Validation
    if network not in ALLOWED_NETWORKS:
        return jsonify({
            'success': False,
            'error': f'Invalid network. Must be one of: {", ".join(ALLOWED_NETWORKS)}'
        }), 400

    if not config_content:
        return jsonify({
            'success': False,
            'error': 'Config content is required'
        }), 400

    container = ALLOWED_CONTAINERS[network]

    # Determine config path based on network
    if network == 'mainnet':
        config_path = '/home/bitcoin/.bitcoin/bitcoin.conf'
        config_dir = '/home/bitcoin/.bitcoin'
    else:
        config_path = f'/home/bitcoin/.bitcoin/testnet4/bitcoin.conf'
        config_dir = '/home/bitcoin/.bitcoin/testnet4'

    logger.info(f"Updating bitcoin.conf for {network}...")

    # Ensure directory exists
    mkdir_cmd = ['docker', 'exec', container, 'mkdir', '-p', config_dir]
    run_command(mkdir_cmd)

    # Write config to container using sh -c with echo
    # Escape single quotes in config content
    escaped_config = config_content.replace("'", "'\"'\"'")
    cmd = ['docker', 'exec', container, 'sh', '-c', f"echo '{escaped_config}' > {config_path}"]
    result = run_command(cmd)

    if result['success']:
        logger.info(f"bitcoin.conf for {network} updated successfully")
        return jsonify({
            'success': True,
            'message': f'bitcoin.conf updated successfully. Restart Bitcoin Core for changes to take effect.',
            'network': network,
            'path': config_path
        })
    else:
        logger.error(f"Failed to update bitcoin.conf: {result.get('stderr')}")
        return jsonify({
            'success': False,
            'error': result.get('stderr') or 'Failed to write bitcoin.conf'
        }), 500


if __name__ == '__main__':
    logger.info("Starting Bitcoin Core Manager API on port 5001")
    app.run(host='0.0.0.0', port=5001, debug=False)
