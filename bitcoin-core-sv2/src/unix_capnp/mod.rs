//! Bitcoin Core IPC-backed protocol runtimes.
//!
//! This backend uses UNIX-socket Cap'n Proto RPC clients to communicate with Bitcoin Core.
//!
//! ## Runtime constraint
//!
//! Due to `capnp-rpc` `!Send` internals, these runtimes must execute inside a
//! [`tokio::task::LocalSet`].

pub mod v30x;
pub mod v31x;

/// The minimum block reserved weight established by Bitcoin Core.
const MIN_BLOCK_RESERVED_WEIGHT: u64 = 2000;

/// BIP141 weight factor (witness scale factor), used to convert vsize to weight units.
const WEIGHT_FACTOR: u64 = 4;

/// Weight a SegWit block needs besides the coinbase outputs added by the Pool or JDC: block
/// header, tx count, coinbase fixed-size fields, `scriptSig`, output count and witness
/// commitment output.
const BLOCK_RESERVED_WEIGHT_WITHOUT_ADDED_OUTPUTS: u64 = 1168;

/// Grace period before stale template data is retired after a chain tip change, in seconds.
///
/// Allows in-flight `RequestTransactionData` and `SubmitSolution` requests to complete before
/// the template data is retired.
const STALE_TEMPLATE_GRACE_PERIOD_SECS: u64 = 10;

/// Bitcoin Core's `MAX_MONEY` consensus constant, in satoshis (21,000,000 BTC).
///
/// Used as a `fee_threshold` sentinel in `waitNext` requests: Bitcoin Core skips fee-based
/// template updates when `fee_threshold >= MAX_MONEY`, while still returning a new template
/// immediately on chain tip changes.
const MAX_MONEY: i64 = 21_000_000 * 100_000_000;

/// Max time a `waitNext` request is allowed to block before timing out (in milliseconds).
const WAIT_NEXT_TIMEOUT_MS: f64 = 10_000.0;

/// Max attempts for `force_update_mempool_mirror` retries on transient "thread busy" IPC
/// contention.
const FORCE_UPDATE_MAX_ATTEMPTS: usize = 3;

/// Backoff between `force_update_mempool_mirror` retry attempts (in milliseconds).
const FORCE_UPDATE_RETRY_BACKOFF_MS: u64 = 25;

/// The block weight to reserve for a coinbase whose added outputs take up to
/// `coinbase_output_max_additional_size` bytes, as the Template Distribution Protocol requires
/// for `CoinbaseOutputConstraints`, never below Bitcoin Core's minimum.
fn block_reserved_weight(coinbase_output_max_additional_size: u32) -> u64 {
    (BLOCK_RESERVED_WEIGHT_WITHOUT_ADDED_OUTPUTS
        + coinbase_output_max_additional_size as u64 * WEIGHT_FACTOR)
        .max(MIN_BLOCK_RESERVED_WEIGHT)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn block_reserved_weight_adds_the_coinbase_outputs_to_the_rest_of_the_block() {
        // 42 payout outputs and a pool output, as a Coinbase Transaction Payouts distribution
        // asks for
        assert_eq!(block_reserved_weight(1385), 1168 + 4 * 1385);
        assert_eq!(block_reserved_weight(209), 1168 + 4 * 209);
    }

    #[test]
    fn block_reserved_weight_never_drops_below_the_bitcoin_core_minimum() {
        assert_eq!(block_reserved_weight(0), MIN_BLOCK_RESERVED_WEIGHT);
        assert_eq!(block_reserved_weight(43), MIN_BLOCK_RESERVED_WEIGHT);
        assert_eq!(block_reserved_weight(208), MIN_BLOCK_RESERVED_WEIGHT);
    }

    #[test]
    fn block_reserved_weight_does_not_overflow() {
        assert_eq!(block_reserved_weight(u32::MAX), 1168 + 4 * u32::MAX as u64);
    }
}
