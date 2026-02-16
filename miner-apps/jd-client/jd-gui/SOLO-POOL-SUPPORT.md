# Solo Pool Support Feature

## Overview

This feature enables JD-Client to work with **solo mining pools** that don't handle payouts themselves. These pools validate your blocks but require you to provide a Bitcoin address so they know where rewards should be sent when you find a block.

**Important:** This is a custom feature added to this GUI implementation and is **NOT** part of the original upstream jd-client.

## Pool Requirements

⚠️ **This feature requires Stratum V2 pools with full Job Declaration Protocol (JDP) support** that can parse your Bitcoin address from the `user_identity` field sent by JD-Client.

**Before enabling this feature, verify with your pool that:**
- They support Stratum V2 with Job Declaration Protocol (JDP)
- They can extract and use the Bitcoin address from the `user_identity` field
- They support solo mining mode (no payout processing)

**Not all Stratum V2 pools support this!** Contact your pool operator to confirm compatibility.

## What Are Solo Mining Pools?

Solo mining pools are a special type of pool that:
- ✅ Validate your work and submit blocks to the network when you find one
- ✅ Provide infrastructure so you don't need to run a full node
- ❌ **Do NOT handle payouts** - block rewards go directly to YOUR address
- ❌ Do NOT pool hashrate with other miners
- ❌ Do NOT take a cut of your rewards (usually just a fixed fee per block found)

**Note:** Very few pools currently support this feature. You must verify with your pool operator before enabling.

## How This Feature Works

### The Problem
Traditional Stratum V2 pools control the coinbase transaction (where rewards go). But solo mining pools need to know **your** Bitcoin address so rewards can be sent directly to you when you find a block.

### The Solution
When you enable "Solo Pool Support" in the JD-Client GUI:

1. **You configure your Bitcoin address** in the Mining tab (`coinbase_reward_script`)
2. **JD-Client sends this address in the `user_identity` field** during channel setup
3. **The pool parses your Bitcoin address** from the `user_identity` (requires pool-side JDP support)
4. **The pool uses your address** in the coinbase transaction when you find a block
5. **Block rewards go directly to you** - the pool never holds your funds

**Technical Detail:** JD-Client sends your Bitcoin address as part of the `user_identity` field in the Stratum V2 protocol. The pool must be configured to parse and extract this address from that field. This is NOT standard Stratum V2 behavior - it requires custom pool-side implementation.

## When to Use This Feature

### ✅ Enable Solo Pool Support When:
- Your pool operator confirms they support parsing Bitcoin address from `user_identity`
- The pool has full Stratum V2 Job Declaration Protocol (JDP) support
- The pool documentation specifically tells you to enable this feature
- You want block rewards sent directly to your wallet
- The pool doesn't handle payouts

### ❌ Do NOT Enable When:
- Mining to a traditional pooled mining setup (regular pools)
- Using Direct Solo Mining mode (no pool involved at all)
- The pool handles payouts themselves (traditional pooled mining)
- The pool has NOT confirmed they support this feature (it won't work!)

## Configuration

### Step 1: Navigate to Configuration → Mining Tab

### Step 2: Configure Your Bitcoin Address
In the "Bitcoin Address (for block rewards)" field, enter your address:
- Mainnet: Starts with `bc1q...` (native SegWit) or `1...` / `3...` (legacy)
- Testnet: Starts with `tb1q...`

Example:
```
bc1q4um96m3vetpspl6eeh79m22pjhsldk82c66wvy
```

The GUI automatically wraps this in the descriptor format:
```toml
coinbase_reward_script = "addr(bc1q4um96m3vetpspl6eeh79m22pjhsldk82c66wvy)"
```

### Step 3: Enable Solo Pool Support
Check the box:
```
☑ Solo Pool Support (send payout address to pool)
```

This tells JD-Client to send your Bitcoin address to the upstream pool.

### Step 4: Configure Your Pool Connection
In the Upstreams tab, configure your solo mining pool details:
- Pool address (e.g., `pool.demand.com:3333`)
- Pool authority public key
- Job Declarator Server address (if separate)

### Step 5: Save and Start
- Click "Validate Configuration"
- Click "Save Configuration"
- Start JD-Client

## Technical Details

### Implementation
This feature modifies the JD-Client configuration by setting:
```toml
send_payout_address_to_pool = true
```

When enabled, JD-Client includes your Bitcoin address in the Stratum V2 channel setup messages, allowing the pool to know where to send rewards.

### Protocol Level
- The address is sent during the `OpenStandardMiningChannel` or `OpenExtendedMiningChannel` handshake
- Solo pools that support this feature will use your address in the coinbase transaction
- Traditional pools that don't support this feature will simply ignore it (no harm)

### Security Considerations
- ✅ **Safe**: You're only sharing a Bitcoin **receiving** address, not private keys
- ✅ **Public information**: Bitcoin addresses can be safely shared
- ✅ **No risk**: Pools cannot spend from your address, only send to it
- ⚠️ **Privacy**: The pool learns your Bitcoin address (which is public anyway once used)

## Comparison with Other Mining Modes

### Solo Pool Support (This Feature)
```
Your Miners → JD-Client → Solo Mining Pool → Bitcoin Network
                              ↓
                    Rewards → Your Bitcoin Address
```
- You get templates from pool or your own Template Provider
- Pool validates and submits blocks
- Rewards go directly to your address
- No payout processing by pool

### Traditional Pooled Mining
```
Your Miners → Pool → Bitcoin Network
                ↓
         Pool's Address → Later payout to you
```
- Pool controls templates entirely
- Pool collects rewards
- Pool processes payouts to miners
- You share rewards with other miners

### Direct Solo Mining (Experimental)
```
Your Miners → JD-Client → Template Provider → Bitcoin Core → Network
                                                  ↓
                                        Your Bitcoin Address
```
- No pool involved at all
- You control everything
- You need a fully synced Bitcoin Core
- Rewards go directly to your address in coinbase

## Troubleshooting

### Pool rejects connection
- **Check**: Does the pool support solo mining?
- **Check**: Is your Bitcoin address valid for the network (mainnet vs testnet)?
- **Check**: Did you configure the correct pool authority public key?

### Rewards not received
- **Check**: Did you actually find a block? (Solo mining can take a very long time)
- **Check**: Is the Bitcoin address correct?
- **Check**: Check block explorer for the block - does the coinbase go to your address?

### Pool says "payout address required"
- **Check**: Is "Solo Pool Support" checkbox enabled?
- **Check**: Is your Bitcoin address configured in the Mining tab?
- **Check**: Did you restart JD-Client after enabling the feature?

## Example Configuration

If you find a pool that supports this feature, here's how to set it up:

1. **Verify pool support** - Contact pool operator to confirm they parse Bitcoin address from `user_identity`
2. **Configure Mining tab:**
   - Bitcoin Address: `bc1qyouraddresshere`
   - Enable: ☑ Solo Pool Support
3. **Configure Upstreams tab:**
   - Pool Address: (from pool documentation)
   - Authority Public Key: (from pool documentation)
4. **Configure Template Provider:**
   - Use Bitcoin Core IPC for full template control
   - Or connect to pool's template provider
5. **Save and Start**

When you find a block, the full block reward (currently 3.125 BTC plus transaction fees) goes directly to your configured address!

## Frequently Asked Questions

### Q: Will this work with regular pools?
**A:** It won't hurt, but it won't help either. Regular pools ignore this field and handle payouts their own way.

### Q: Is this more profitable than pooled mining?
**A:** Solo mining (via solo pools) gives you the **full block reward** when you find a block, but you may wait months or years between blocks depending on your hashrate. Pooled mining gives smaller, regular payouts.

### Q: Do I need to trust the pool with this feature?
**A:** You trust them to:
- Validate and submit your blocks correctly
- Not steal your work
- Use the correct Bitcoin address

You do NOT trust them with:
- Holding your funds (rewards go directly to your address)
- Your private keys (you never share those)

### Q: Can I change my address later?
**A:** Yes! Just update the Bitcoin address in the Mining tab and restart JD-Client. New blocks will use the new address.

### Q: What if I put the wrong address?
**A:** If you find a block, the reward goes to whatever address you configured. **Double-check before starting!** There's no "undo" for Bitcoin transactions.

## Summary

Solo Pool Support is a bridge feature that allows JD-Client to work with solo mining pools that require you to provide a payout address. It's perfect for miners who:
- Want full block rewards without sharing
- Want template control (Stratum V2)
- Don't want to run a full Bitcoin Core node
- Trust a solo pool to validate their work

Enable it in Configuration → Mining tab when connecting to solo mining pools like DEMAND.

---

**Note:** This feature is specific to this GUI implementation and is not part of the upstream jd-client project.
