# Downstream Miner Reporting

## Problem

When miners connect through a JD-Client (JDC) proxy, the pool only sees a single `jd-client/sv2` connection. This hides the actual devices behind it (bitaxe, NerdQAxe, etc.) from pool statistics. Downstream miner reporting solves this by letting the JDC periodically report its connected miners to the pool.

## How It Works

1. Miners connect to JDC as downstream SV2 clients
2. JDC parses its own logs to track connected miners (vendor, hashrate, etc.)
3. Every 60 seconds, JDC POSTs a report to the pool
4. The pool excludes the reporting JDC from its `jd-client/sv2` stats and replaces it with the actual device entries (e.g. `bitaxe/sv2`)

JDC sends the report to the same `pool_address` already configured in its upstream settings. The pool's mining port detects HTTP requests and proxies them to its API, so no additional port configuration is needed on the JDC side.

## For JDC GUI Users

Enable "Report downstream miners" in your configuration. No other setup required — the report URL is derived from your existing `pool_address`.

Your pool must support this feature. Ask your pool operator if they accept downstream miner reports.

## For Pool Providers

### API Endpoint

Implement the following endpoint on your pool's API:

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
      "hardwareVersion": "401",
      "firmware": "2.5.0",
      "deviceId": "ABC123",
      "nominalHashRate": 500000000000,
      "userIdentity": "bc1q...addr.worker1",
      "connectedAt": "2026-02-15T11:30:00Z"
    }
  ]
}
```

#### Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `schemaVersion` | integer | yes | Always `1` for this version |
| `jdcUserIdentity` | string | yes | The `user_identity` the JDC uses to connect to the pool (typically a bitcoin address). Use this to identify which pool-side client record belongs to this JDC. |
| `timestamp` | string | yes | ISO 8601 timestamp of when the report was generated |
| `miners` | array | yes | List of currently connected downstream miners |

#### Miner Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `vendor` | string | yes | Device vendor from SV2 `SetupConnection.vendor` (e.g. `bitaxe`, `NerdQAxe`) |
| `hardwareVersion` | string | no | Hardware version from `SetupConnection.hardware_version` |
| `firmware` | string | no | Firmware version from `SetupConnection.firmware` |
| `deviceId` | string | no | Device identifier from `SetupConnection.device_id` |
| `nominalHashRate` | integer | no | Self-reported hashrate in H/s from `OpenStandardMiningChannel.nominal_hash_rate` |
| `userIdentity` | string | no | Worker identity from `OpenStandardMiningChannel.user_identity` |
| `connectedAt` | string | no | ISO 8601 timestamp of when the miner connected to JDC |

### Response

```json
{
  "success": true,
  "accepted": 3
}
```

| Field | Type | Description |
|-------|------|-------------|
| `success` | boolean | Whether the report was stored |
| `accepted` | integer | Number of miners in the report |

### Implementation Guide

#### 1. Store reports with a TTL

Store the latest report per `jdcUserIdentity` with a 5-minute expiry. JDC sends reports every 60 seconds, so reports that stop arriving indicate the JDC has disconnected.

```
reports = Map<jdcUserIdentity, { report, receivedAt }>

On receive: reports.set(jdcUserIdentity, { report, now() })
On query:   delete entries where now() - receivedAt > 5 minutes
```

#### 2. Exclude reporting JDCs from userAgent stats

When building your userAgent statistics (device type breakdown), exclude clients whose address matches a `jdcUserIdentity` that has an active (non-expired) report. This prevents double-counting.

```sql
-- Example: exclude reporting JDC addresses from the aggregation
SELECT userAgent, COUNT(*) as count, SUM(hashRate) as totalHashRate
FROM clients
WHERE address NOT IN ('bc1q_reporting_jdc_1', 'bc1q_reporting_jdc_2')
GROUP BY userAgent
```

#### 3. Add reported miners to stats

Aggregate the miners from all active reports by vendor and append them to your userAgent list:

```
For each active report:
  For each miner:
    aggregate by vendor → { count, totalHashRate }

Append to userAgent stats as:
  { userAgent: "bitaxe/sv2", count: 3, totalHashRate: 1500000000000 }
```

#### 4. HTTP detection on mining port (optional)

JDC sends the report to the `pool_address` it already has configured — which is the mining port. If your mining port only speaks Stratum, you need to detect HTTP requests and proxy them to your API port.

HTTP requests start with `G` (0x47 = GET) or `P` (0x50 = POST). Check the first byte of incoming connections:

```
first byte == 0x47 or 0x50 → proxy to API port
first byte == 0x7B ('{')   → Stratum V1 (JSON-RPC)
anything else               → Stratum V2 (binary)
```

If your pool already exposes the API on a separate port that JDC users could reach directly, this step is not required — but it means JDC users would need to configure a separate report URL instead of relying on zero-config.

### Debugging

Optionally expose a GET endpoint to inspect stored reports:

```
GET /api/downstream-report → returns all active reports
```

## Report Lifecycle

```
JDC starts → miners connect → JDC tracks via logs
                                    ↓
                            every 60s: POST report to pool
                                    ↓
                  pool stores report, excludes JDC from stats,
                  adds downstream miners to stats
                                    ↓
              miner disconnects → removed from next report
              JDC stops → no more reports → TTL expires (5min)
                          → pool reverts to showing jd-client/sv2
```
