//! Payout distribution of the Coinbase Transaction Payouts extension (0x0003).

use stratum_apps::stratum_core::{
    bitcoin::{Amount, TxOut, consensus},
    extensions_sv2::{PayoutComputationError, SetPayoutDistributionOwned, compute_payout_amounts},
};

use crate::error::JDCErrorKind;

/// A `SetPayoutDistribution` with its outputs deserialized.
///
/// The amount fields of `pool_payout` and `payouts` hold relative weights, those of
/// `additional_outputs` hold fixed satoshi amounts.
#[derive(Clone, Debug)]
pub struct PayoutDistribution {
    pub distribution_id: u64,
    pool_payout: TxOut,
    payouts: Vec<TxOut>,
    dust_limits: Vec<u32>,
    additional_outputs: Vec<TxOut>,
}

impl TryFrom<SetPayoutDistributionOwned> for PayoutDistribution {
    type Error = JDCErrorKind;

    fn try_from(msg: SetPayoutDistributionOwned) -> Result<Self, Self::Error> {
        let deserialize = |bytes: &[u8]| -> Result<TxOut, JDCErrorKind> {
            consensus::deserialize(bytes).map_err(|_| JDCErrorKind::InvalidPayoutDistribution)
        };
        Ok(Self {
            distribution_id: msg.distribution_id,
            pool_payout: deserialize(msg.pool_payout.as_bytes())?,
            payouts: msg
                .payouts
                .iter_bytes()
                .map(deserialize)
                .collect::<Result<_, _>>()?,
            dust_limits: msg.dust_limits.into_inner(),
            additional_outputs: msg
                .additional_outputs
                .iter_bytes()
                .map(deserialize)
                .collect::<Result<_, _>>()?,
        })
    }
}

impl PayoutDistribution {
    /// Returns every output the distribution can put in a coinbase, dust-prunable ones included,
    /// which is what the coinbase space reserved for it has to hold.
    pub fn outputs(&self) -> Vec<TxOut> {
        let mut outputs = vec![self.pool_payout.clone()];
        outputs.extend(self.payouts.iter().cloned());
        outputs.extend(self.additional_outputs.iter().cloned());
        outputs
    }

    /// Returns the coinbase outputs that pay `template_revenue` according to this distribution,
    /// in the order the extension requires: the pool payout, the miner payouts that are not
    /// dust-pruned, then the additional outputs.
    pub fn coinbase_outputs(
        &self,
        template_revenue: u64,
    ) -> Result<Vec<TxOut>, PayoutComputationError> {
        let weights: Vec<u64> = self
            .payouts
            .iter()
            .map(|output| output.value.to_sat())
            .collect();
        let fixed_amounts: Vec<u64> = self
            .additional_outputs
            .iter()
            .map(|output| output.value.to_sat())
            .collect();
        let amounts = compute_payout_amounts(
            template_revenue,
            self.pool_payout.value.to_sat(),
            &weights,
            &self.dust_limits,
            &fixed_amounts,
        )?;

        let mut outputs = vec![TxOut {
            value: Amount::from_sat(amounts.pool_payout),
            script_pubkey: self.pool_payout.script_pubkey.clone(),
        }];
        outputs.extend(
            self.payouts
                .iter()
                .zip(amounts.payouts)
                .filter_map(|(output, amount)| {
                    Some(TxOut {
                        value: Amount::from_sat(amount?),
                        script_pubkey: output.script_pubkey.clone(),
                    })
                }),
        );
        outputs.extend(self.additional_outputs.iter().cloned());
        Ok(outputs)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use stratum_apps::stratum_core::bitcoin::ScriptBuf;

    fn output(value: u64, script_byte: u8) -> TxOut {
        TxOut {
            value: Amount::from_sat(value),
            script_pubkey: ScriptBuf::from_bytes(vec![0x6a, script_byte]),
        }
    }

    fn message(
        pool_payout: TxOut,
        payouts: &[TxOut],
        dust_limits: Vec<u32>,
        additional_outputs: &[TxOut],
    ) -> SetPayoutDistributionOwned {
        let serialize_all = |outputs: &[TxOut]| {
            outputs
                .iter()
                .map(|o| consensus::serialize(o).try_into().unwrap())
                .collect::<Vec<_>>()
                .try_into()
                .unwrap()
        };
        SetPayoutDistributionOwned {
            distribution_id: 1,
            pool_payout: consensus::serialize(&pool_payout).try_into().unwrap(),
            payouts: serialize_all(payouts),
            dust_limits: dust_limits.try_into().unwrap(),
            additional_outputs: serialize_all(additional_outputs),
        }
    }

    #[test]
    fn coinbase_outputs_follow_the_extension_order_and_skip_dust() {
        let distribution = PayoutDistribution::try_from(message(
            output(10, 0),
            &[output(989, 1), output(1, 2)],
            vec![0, 2],
            &[output(0, 3)],
        ))
        .unwrap();

        let outputs = distribution.coinbase_outputs(1_000).unwrap();

        assert_eq!(
            outputs,
            vec![output(11, 0), output(989, 1), output(0, 3)],
            "the dust-pruned payout is omitted and its amount goes to the pool payout"
        );
        let total: u64 = outputs.iter().map(|o| o.value.to_sat()).sum();
        assert_eq!(total, 1_000);
    }

    #[test]
    fn fixed_outputs_reaching_the_revenue_cannot_be_paid() {
        let distribution = PayoutDistribution::try_from(message(
            output(1, 0),
            &[output(1, 1)],
            vec![0],
            &[output(1_000, 3)],
        ))
        .unwrap();

        assert_eq!(
            distribution.coinbase_outputs(1_000),
            Err(PayoutComputationError::FixedOutputsExceedRevenue)
        );
    }

    #[test]
    fn malformed_outputs_are_rejected() {
        let mut msg = message(output(1, 0), &[], vec![], &[]);
        msg.pool_payout = vec![1, 2, 3].try_into().unwrap();
        assert!(matches!(
            PayoutDistribution::try_from(msg),
            Err(JDCErrorKind::InvalidPayoutDistribution)
        ));
    }
}
