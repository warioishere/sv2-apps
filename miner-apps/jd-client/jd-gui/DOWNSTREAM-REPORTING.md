# Downstream Miner Reporting

## Problem

When miners connect through a JD-Client (JDC) proxy, the pool sees a single `jd-client/sv2` connection. The actual devices behind it (bitaxe, NerdQAxe, etc.) are hidden from pool statistics. Downstream miner reporting solves this by having the JDC periodically report its connected miners to the pool, which then renames the client's `userAgent` to the real device type.

## How It Works

1. Miners connect to JDC as downstream SV2 clients
2. JDC parses its own log output to track connected miners (vendor, hashrate, etc.)
3. Every 60 seconds, JDC sends a POST request to the pool with the list of connected miners
4. The pool updates the `userAgent` field of the matching client record in its database (e.g. `jd-client/sv2` becomes `bitaxe/sv2`)

Because the pool updates the existing client record, all real session data (bestDifficulty, hashRate, worker stats) is preserved — only the displayed device name changes.

JDC sends the report to the same `pool_address` configured in its upstream settings. If the pool detects HTTP on the mining port, it can proxy the request to its API. No additional port configuration is needed on the JDC side.

## For JDC Users

Enable **"Report downstream miners to pool"** in your mining configuration. No other setup required — the report URL is derived from your existing `pool_address`.

Your pool must support this feature. Ask your pool operator if they accept downstream miner reports.

## For Pool Operators

### API Endpoint

Add the following endpoint to your pool's API:

```
POST /api/downstream-report
Content-Type: application/json
```

### Request Schema

```json
{
  "schemaVersion": 1,
  "jdcUserIdentity": "bc1q...",
  "timestamp": "2026-02-15T12:00:00Z",
  "miners": [
    {
      "vendor": "bitaxe",
      "hardwareVersion": "BM1370",
      "firmware": "",
      "deviceId": "",
      "nominalHashRate": 1000000000000,
      "userIdentity": "bc1q...addr.bitaxe",
      "connectedAt": "2026-02-15T11:30:00Z"
    }
  ]
}
```

#### Top-level Fields

| Field | Type | Description |
|-------|------|-------------|
| `schemaVersion` | integer | Always `1` for this version |
| `jdcUserIdentity` | string | The `user_identity` the JDC uses to connect to the pool (typically a bitcoin address). Use this to match the client record in your database. |
| `timestamp` | string | ISO 8601 timestamp of when the report was generated |
| `miners` | array | Currently connected downstream miners |

#### Miner Fields

| Field | Type | Description |
|-------|------|-------------|
| `vendor` | string | Device vendor from SV2 `SetupConnection.vendor` (e.g. `bitaxe`, `NerdQAxe`). May be empty for some devices. |
| `hardwareVersion` | string | Hardware version (e.g. `BM1370`). May be empty. |
| `firmware` | string | Firmware version. May be empty. |
| `deviceId` | string | Device identifier. May be empty. |
| `nominalHashRate` | number | Self-reported hashrate in H/s from `OpenStandardMiningChannel` |
| `userIdentity` | string | Worker identity from `OpenStandardMiningChannel.user_identity` |
| `connectedAt` | string | ISO 8601 timestamp of when the miner connected to JDC |

### Response

```json
{
  "success": true,
  "accepted": 1
}
```

### Implementation Guide

#### 1. On receiving a report: update the client's userAgent in your database

When a report arrives, find the client record(s) matching `jdcUserIdentity` (the pool-side `address` field) with `userAgent = 'jd-client/sv2'`, and rename the `userAgent` to the downstream vendor:

```sql
UPDATE clients
SET userAgent = 'bitaxe/sv2'
WHERE address = :jdcUserIdentity
  AND userAgent = 'jd-client/sv2'
```

To determine the vendor name, take the most common `vendor` field from the miners array and append `/sv2`. For example, if a report has 2 bitaxe miners and 1 NerdAxe, use `bitaxe/sv2`.

This approach has key advantages:
- **Real stats preserved**: bestDifficulty, hashRate, and all other session data remain untouched
- **Works with multiple JDCs**: each JDC has a different address, so updates target only the right rows
- **No aggregation changes**: your existing `GROUP BY userAgent` queries automatically show `bitaxe/sv2` instead of `jd-client/sv2`

#### 2. Store reports with a TTL (optional)

Keep the latest report per `jdcUserIdentity` in memory with a 5-minute TTL. This lets you:
- Expose a GET endpoint for debugging
- Detect when a JDC stops reporting (it disconnected or disabled the feature)

JDC sends reports every 60 seconds. If reports stop arriving and the TTL expires, the `userAgent` stays as whatever it was last set to — no flipping back to `jd-client/sv2` since the DB was updated directly.

#### 3. When the JDC reconnects

When a JDC reconnects, the pool creates a new client session with `userAgent = 'jd-client/sv2'`. Within 60 seconds the next downstream report arrives and renames it again. This brief window is expected.

#### 4. HTTP detection on mining port (optional)

JDC sends the report to the configured `pool_address` — which is the mining port. If your mining port only speaks Stratum, detect HTTP requests by checking the first byte:

```
first byte == 0x47 (G) or 0x50 (P) → proxy to API port
first byte == 0x7B ({)             → Stratum V1 JSON-RPC
anything else                       → Stratum V2 binary
```

If your API is already reachable on the same address, this step is not needed.

### Debugging

Expose a GET endpoint to inspect active reports:

```
GET /api/downstream-report → returns stored reports (array)
```

## Report Lifecycle

```
JDC starts → miners connect → JDC tracks via log parsing
                                    |
                            every 60s: POST report to pool
                                    |
                  pool receives report, updates userAgent
                  in client DB: jd-client/sv2 → bitaxe/sv2
                                    |
              miner disconnects → removed from next report
              JDC stops → no more reports
                          userAgent stays as bitaxe/sv2
                          until JDC reconnects (resets to jd-client/sv2,
                          then renamed again on next report)
```
