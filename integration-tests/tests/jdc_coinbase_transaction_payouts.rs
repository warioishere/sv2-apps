use async_channel::Sender;
use integration_tests_sv2::{
    JDC_COINBASE_REWARD_DESCRIPTOR,
    interceptor::MessageDirection,
    mock_roles::{MockDownstream, MockUpstream, WithSetup},
    sniffer::Sniffer,
    utils::get_available_address,
};
use jd_client_sv2::{
    JobDeclaratorClient,
    config::{ConfigJDCMode, Upstream},
};
use std::{net::SocketAddr, time::Duration};
use stratum_apps::{
    coinbase_output_constraints::coinbase_output_constraints_message,
    config_helpers::CoinbaseRewardScript,
    key_utils::Secp256k1PublicKey,
    stratum_core::{
        bitcoin::{Amount, ScriptBuf, TxOut, consensus::serialize},
        channels_sv2::outputs::deserialize_outputs,
        common_messages_sv2::Protocol,
        extensions_sv2::{
            DistributionId, EXTENSION_TYPE_COINBASE_TRANSACTION_PAYOUTS,
            RequestExtensionsSuccessOwned, SetPayoutDistributionOwned,
        },
        job_declaration_sv2::{AllocateMiningJobTokenSuccessOwned, DeclareMiningJobOwned},
        mining_sv2::{
            MESSAGE_TYPE_OPEN_EXTENDED_MINING_CHANNEL_SUCCESS, OpenExtendedMiningChannelOwned,
            OpenExtendedMiningChannelSuccessOwned, SetCustomMiningJobOwned,
        },
        parsers_sv2::{
            AnyMessageOwned, ExtensionsNegotiationOwned, ExtensionsOwned, JobDeclarationOwned,
            MiningOwned, TemplateDistributionOwned, Tlv, TlvField,
        },
        template_distribution_sv2::{
            CoinbaseOutputConstraintsOwned, NewTemplateOwned, RequestTransactionDataSuccessOwned,
            SetNewPrevHashOwned,
        },
    },
};

// How long a test waits for JDC to send a message it must send. Covers the extension negotiation
// timeout of a JDS that never answers.
const WAIT: Duration = Duration::from_secs(30);
const TEMPLATE_REVENUE: u64 = 5_000_000_000;

fn script(tag: u8) -> ScriptBuf {
    let mut bytes = vec![0x00, 0x14];
    bytes.extend([tag; 20]);
    ScriptBuf::from_bytes(bytes)
}

fn output(value: u64, tag: u8) -> TxOut {
    TxOut {
        value: Amount::from_sat(value),
        script_pubkey: script(tag),
    }
}

// A distribution whose pool payout has weight 2 and whose miner payouts are given by `weights`,
// paying scripts tagged 1, 2, ...
fn distribution(distribution_id: u64, weights: &[u64]) -> (SetPayoutDistributionOwned, Vec<TxOut>) {
    let pool_payout = output(2, 0);
    let payouts: Vec<TxOut> = weights
        .iter()
        .enumerate()
        .map(|(i, &weight)| output(weight, i as u8 + 1))
        .collect();
    let mut outputs = vec![pool_payout.clone()];
    outputs.extend(payouts.iter().cloned());
    let message = SetPayoutDistributionOwned {
        distribution_id,
        pool_payout: serialize(&pool_payout).try_into().unwrap(),
        payouts: payouts
            .iter()
            .map(|payout| serialize(payout).try_into().unwrap())
            .collect::<Vec<_>>()
            .try_into()
            .unwrap(),
        dust_limits: vec![0; payouts.len()].try_into().unwrap(),
        additional_outputs: Vec::new().try_into().unwrap(),
    };
    (message, outputs)
}

fn template(template_id: u64, future_template: bool) -> NewTemplateOwned {
    NewTemplateOwned {
        template_id,
        future_template,
        version: 536_870_912,
        coinbase_tx_version: 2,
        coinbase_prefix: vec![82, 0].try_into().unwrap(),
        coinbase_tx_input_sequence: u32::MAX,
        coinbase_tx_value_remaining: TEMPLATE_REVENUE,
        coinbase_tx_outputs_count: 1,
        coinbase_tx_outputs: vec![
            0, 0, 0, 0, 0, 0, 0, 0, 38, 106, 36, 170, 33, 169, 237, 226, 246, 28, 63, 113, 209,
            222, 253, 63, 169, 153, 223, 163, 105, 83, 117, 92, 105, 6, 137, 121, 153, 98, 180,
            139, 235, 216, 54, 151, 78, 140, 249,
        ]
        .try_into()
        .unwrap(),
        coinbase_tx_locktime: 0,
        merkle_path: vec![].try_into().unwrap(),
    }
}

fn distribution_id(tlvs: Option<Vec<Tlv>>) -> Option<u64> {
    tlvs?
        .iter()
        .find(|tlv| tlv.r#type.extension_type == EXTENSION_TYPE_COINBASE_TRANSACTION_PAYOUTS)
        .map(|tlv| DistributionId::from_tlv(tlv).unwrap().0)
}

// Pops messages JDC sent through `sniffer` until `pick` accepts one.
async fn sent_by_jdc<T>(
    sniffer: &Sniffer<'_>,
    what: &str,
    mut pick: impl FnMut(AnyMessageOwned, Option<Vec<Tlv>>) -> Option<T>,
) -> T {
    tokio::time::timeout(WAIT, async {
        loop {
            match sniffer.next_message_from_downstream_with_tlvs() {
                Some((_, message, tlvs)) => {
                    if let Some(found) = pick(message, tlvs) {
                        return found;
                    }
                }
                None => tokio::time::sleep(Duration::from_millis(100)).await,
            }
        }
    })
    .await
    .unwrap_or_else(|_| panic!("JDC did not send {what}"))
}

async fn constraints_sent(sniffer: &Sniffer<'_>) -> CoinbaseOutputConstraintsOwned {
    sent_by_jdc(
        sniffer,
        "CoinbaseOutputConstraints",
        |message, _| match message {
            AnyMessageOwned::TemplateDistribution(
                TemplateDistributionOwned::CoinbaseOutputConstraints(constraints),
            ) => Some(constraints),
            _ => None,
        },
    )
    .await
}

async fn custom_job_sent(sniffer: &Sniffer<'_>) -> (SetCustomMiningJobOwned, Option<u64>) {
    sent_by_jdc(
        sniffer,
        "SetCustomMiningJob",
        |message, tlvs| match message {
            AnyMessageOwned::Mining(MiningOwned::SetCustomMiningJob(job)) => {
                Some((job, distribution_id(tlvs)))
            }
            _ => None,
        },
    )
    .await
}

// The outputs JDC itself adds to a custom job's coinbase, without the template's own outputs.
fn jdc_outputs(job: &SetCustomMiningJobOwned) -> Vec<TxOut> {
    let mut outputs = deserialize_outputs(job.coinbase_tx_outputs.to_owned_bytes()).unwrap();
    outputs.pop();
    outputs
}

// JDC behind sniffers, with every peer mocked: the test drives each protocol step itself.
struct Harness {
    tp: Sender<AnyMessageOwned>,
    tp_sniffer: Sniffer<'static>,
    pool: Sender<AnyMessageOwned>,
    pool_sniffer: Sniffer<'static>,
    jds: Sender<AnyMessageOwned>,
    jds_sniffer: Sniffer<'static>,
    jdc: JobDeclaratorClient,
    jdc_addr: SocketAddr,
}

impl Harness {
    async fn start(mode: ConfigJDCMode) -> Self {
        integration_tests_sv2::start_tracing();

        let mock_tp_addr = get_available_address();
        let tp = MockUpstream::new(
            mock_tp_addr,
            WithSetup::yes_with_defaults(Protocol::TemplateDistributionProtocol, 0),
        )
        .start()
        .await;
        let (tp_sniffer, tp_sniffer_addr) =
            integration_tests_sv2::start_sniffer("jdc-tp", mock_tp_addr, false, vec![], None);

        let mock_pool_addr = get_available_address();
        let pool = MockUpstream::new(
            mock_pool_addr,
            WithSetup::yes_with_defaults(Protocol::MiningProtocol, 0),
        )
        .start()
        .await;
        let (pool_sniffer, pool_sniffer_addr) =
            integration_tests_sv2::start_sniffer("jdc-pool", mock_pool_addr, false, vec![], None);

        let mock_jds_addr = get_available_address();
        let jds = MockUpstream::new(
            mock_jds_addr,
            WithSetup::yes_with_defaults(Protocol::JobDeclarationProtocol, 0),
        )
        .start()
        .await;
        let (jds_sniffer, jds_sniffer_addr) =
            integration_tests_sv2::start_sniffer("jdc-jds", mock_jds_addr, false, vec![], None);

        let mut upstream = Upstream::new(
            Secp256k1PublicKey::try_from(
                "9auqWEzQDVyd2oe1JVGFLMLHZtCo2FFqZwtKA5gd9xbuEu7PH72".to_string(),
            )
            .unwrap(),
            pool_sniffer_addr.ip().to_string(),
            pool_sniffer_addr.port(),
            jds_sniffer_addr.ip().to_string(),
            jds_sniffer_addr.port(),
            "IT_TEST".to_string(),
        );
        upstream.coinbase_transaction_payouts = true;
        let (jdc, jdc_addr, _) = integration_tests_sv2::start_jdc_with_upstreams(
            vec![upstream],
            integration_tests_sv2::sv2_tp_config(tp_sniffer_addr),
            vec![],
            vec![],
            false,
            Some(mode),
        );

        Self {
            tp,
            tp_sniffer,
            pool,
            pool_sniffer,
            jds,
            jds_sniffer,
            jdc,
            jdc_addr,
        }
    }

    // Answers JDC's RequestExtensions on the pool connection, which must ask for the extension.
    async fn pool_answers_request_extensions(&self, supported: Vec<u16>) {
        let request = sent_by_jdc(
            &self.pool_sniffer,
            "RequestExtensions to the pool",
            |message, _| match message {
                AnyMessageOwned::Extensions(ExtensionsOwned::ExtensionsNegotiation(
                    ExtensionsNegotiationOwned::RequestExtensions(request),
                )) => Some(request),
                _ => None,
            },
        )
        .await;
        assert!(
            request
                .requested_extensions
                .clone()
                .into_inner()
                .contains(&EXTENSION_TYPE_COINBASE_TRANSACTION_PAYOUTS)
        );
        self.pool
            .send(AnyMessageOwned::Extensions(
                RequestExtensionsSuccessOwned {
                    request_id: request.request_id,
                    supported_extensions: supported.try_into().unwrap(),
                }
                .into(),
            ))
            .await
            .unwrap();
    }

    // Waits for JDC's RequestExtensions on the JDS connection.
    async fn jds_receives_request_extensions(&self) -> u16 {
        sent_by_jdc(
            &self.jds_sniffer,
            "RequestExtensions to the JDS",
            |message, _| match message {
                AnyMessageOwned::Extensions(ExtensionsOwned::ExtensionsNegotiation(
                    ExtensionsNegotiationOwned::RequestExtensions(request),
                )) => Some(request.request_id),
                _ => None,
            },
        )
        .await
    }

    // Agrees to the extension on the JDS connection and publishes `distribution` right away.
    async fn jds_negotiates(&self, distribution: SetPayoutDistributionOwned) {
        let request_id = self.jds_receives_request_extensions().await;
        self.jds
            .send(AnyMessageOwned::Extensions(
                RequestExtensionsSuccessOwned {
                    request_id,
                    supported_extensions: vec![EXTENSION_TYPE_COINBASE_TRANSACTION_PAYOUTS]
                        .try_into()
                        .unwrap(),
                }
                .into(),
            ))
            .await
            .unwrap();
        self.jds_publishes(distribution).await;
    }

    async fn jds_publishes(&self, distribution: SetPayoutDistributionOwned) {
        self.jds
            .send(AnyMessageOwned::Extensions(distribution.into()))
            .await
            .unwrap();
    }

    // Hands out tokens without coinbase outputs, as a JDS does once the extension is negotiated.
    async fn jds_hands_out_tokens(&self, count: u64) {
        for token in 0..count {
            self.jds
                .send(AnyMessageOwned::JobDeclaration(
                    JobDeclarationOwned::AllocateMiningJobTokenSuccess(
                        AllocateMiningJobTokenSuccessOwned {
                            request_id: token as u32,
                            mining_job_token: token.to_le_bytes().try_into().unwrap(),
                            coinbase_outputs: Vec::new().try_into().unwrap(),
                        },
                    ),
                ))
                .await
                .unwrap();
        }
    }

    async fn tp_sends_template(&self, template: NewTemplateOwned) {
        self.tp
            .send(AnyMessageOwned::TemplateDistribution(
                TemplateDistributionOwned::NewTemplate(template),
            ))
            .await
            .unwrap();
    }

    async fn tp_sends_prev_hash(&self, template_id: u64, prev_hash: u8) {
        self.tp
            .send(AnyMessageOwned::TemplateDistribution(
                TemplateDistributionOwned::SetNewPrevHash(SetNewPrevHashOwned {
                    template_id,
                    prev_hash: [prev_hash; 32].into(),
                    ntime_start: 1_700_000_000 + template_id as u32,
                    n_bits: 0x1d00ffff,
                    target: [0xff; 32].into(),
                }),
            ))
            .await
            .unwrap();
    }

    // Connects a downstream and opens the upstream extended channel it triggers.
    async fn open_channel(&self) -> Sniffer<'static> {
        let (downstream_sniffer, downstream_sniffer_addr) = integration_tests_sv2::start_sniffer(
            "downstream-jdc",
            self.jdc_addr,
            false,
            vec![],
            None,
        );
        let downstream = MockDownstream::new(
            downstream_sniffer_addr,
            WithSetup::yes_with_defaults(Protocol::MiningProtocol, 0),
        )
        .start()
        .await;
        downstream
            .send(AnyMessageOwned::Mining(
                MiningOwned::OpenExtendedMiningChannel(OpenExtendedMiningChannelOwned {
                    request_id: 1,
                    user_identity: "payouts".try_into().unwrap(),
                    nominal_hash_rate: 1_000.0,
                    max_target: [0xff; 32].into(),
                    min_extranonce_size: 0,
                }),
            ))
            .await
            .unwrap();

        let open = sent_by_jdc(
            &self.pool_sniffer,
            "OpenExtendedMiningChannel",
            |message, _| match message {
                AnyMessageOwned::Mining(MiningOwned::OpenExtendedMiningChannel(open)) => Some(open),
                _ => None,
            },
        )
        .await;
        self.pool
            .send(AnyMessageOwned::Mining(
                MiningOwned::OpenExtendedMiningChannelSuccess(
                    OpenExtendedMiningChannelSuccessOwned {
                        request_id: open.request_id,
                        channel_id: 9,
                        target: [0xff; 32].into(),
                        extranonce_size: open.min_extranonce_size,
                        extranonce_prefix: vec![0; 4].try_into().unwrap(),
                        group_channel_id: 1,
                    },
                ),
            ))
            .await
            .unwrap();
        downstream_sniffer
            .wait_for_message_type(
                MessageDirection::ToDownstream,
                MESSAGE_TYPE_OPEN_EXTENDED_MINING_CHANNEL_SUCCESS,
            )
            .await;
        downstream_sniffer
    }
}

/// In Coinbase-only mode, the custom job a chain tip update produces pays the payout distribution
/// and names it in the `distribution_id` TLV. The Template Provider receives no
/// `CoinbaseOutputConstraints` before the distribution, and then the ones its outputs need.
#[tokio::test]
async fn coinbase_only_custom_job_pays_the_payout_distribution() {
    let harness = Harness::start(ConfigJDCMode::CoinbaseOnly).await;
    let (message, distribution_outputs) = distribution(7, &[49, 49]);

    harness
        .pool_answers_request_extensions(vec![EXTENSION_TYPE_COINBASE_TRANSACTION_PAYOUTS])
        .await;
    harness.jds_negotiates(message).await;
    harness.jds_hands_out_tokens(4).await;

    assert_eq!(
        constraints_sent(&harness.tp_sniffer).await,
        coinbase_output_constraints_message(distribution_outputs),
        "the first constraints must follow from the first distribution"
    );

    harness.tp_sends_template(template(1, true)).await;
    harness.tp_sends_prev_hash(1, 0x11).await;
    let _downstream = harness.open_channel().await;
    harness.tp_sends_template(template(2, true)).await;
    harness.tp_sends_prev_hash(2, 0x22).await;

    let (job, distribution_id) = custom_job_sent(&harness.pool_sniffer).await;
    harness.jdc.shutdown().await;

    assert_eq!(distribution_id, Some(7));
    assert_eq!(
        jdc_outputs(&job),
        vec![
            output(100_000_000, 0),
            output(2_450_000_000, 1),
            output(2_450_000_000, 2),
        ]
    );
}

/// In Full-Template mode, the `distribution_id` TLV goes on `DeclareMiningJob`, whose coinbase
/// pays the payout distribution.
#[tokio::test]
async fn full_template_declaration_pays_the_payout_distribution() {
    let harness = Harness::start(ConfigJDCMode::FullTemplate).await;
    let (message, _) = distribution(7, &[49, 49]);

    harness
        .pool_answers_request_extensions(vec![EXTENSION_TYPE_COINBASE_TRANSACTION_PAYOUTS])
        .await;
    harness.jds_negotiates(message).await;
    harness.jds_hands_out_tokens(4).await;

    harness.tp_sends_template(template(1, true)).await;
    harness.tp_sends_prev_hash(1, 0x11).await;
    let _downstream = harness.open_channel().await;

    sent_by_jdc(
        &harness.tp_sniffer,
        "RequestTransactionData",
        |message, _| {
            matches!(
                message,
                AnyMessageOwned::TemplateDistribution(
                    TemplateDistributionOwned::RequestTransactionData(_)
                )
            )
            .then_some(())
        },
    )
    .await;
    harness
        .tp
        .send(AnyMessageOwned::TemplateDistribution(
            TemplateDistributionOwned::RequestTransactionDataSuccess(
                RequestTransactionDataSuccessOwned {
                    template_id: 1,
                    excess_data: vec![].try_into().unwrap(),
                    transaction_list: vec![].try_into().unwrap(),
                },
            ),
        ))
        .await
        .unwrap();

    let (declaration, distribution_id): (DeclareMiningJobOwned, Option<u64>) = sent_by_jdc(
        &harness.jds_sniffer,
        "DeclareMiningJob",
        |message, tlvs| match message {
            AnyMessageOwned::JobDeclaration(JobDeclarationOwned::DeclareMiningJob(declaration)) => {
                Some((declaration, distribution_id(tlvs)))
            }
            _ => None,
        },
    )
    .await;
    harness.jdc.shutdown().await;

    assert_eq!(distribution_id, Some(7));
    let suffix = declaration.coinbase_tx_suffix.to_owned_bytes();
    let expected_outputs: Vec<u8> = [
        output(100_000_000, 0),
        output(2_450_000_000, 1),
        output(2_450_000_000, 2),
    ]
    .iter()
    .flat_map(serialize)
    .collect();
    assert!(
        suffix
            .windows(expected_outputs.len())
            .any(|window| window == expected_outputs.as_slice()),
        "the declared coinbase must pay the payout distribution, in order"
    );
}

/// A distribution that needs more coinbase space than the templates reserve only takes effect at
/// the next `SetNewPrevHash`; until then, jobs keep following the previous distribution.
#[tokio::test]
async fn larger_distribution_waits_for_the_next_prev_hash() {
    let harness = Harness::start(ConfigJDCMode::CoinbaseOnly).await;
    let (first, _) = distribution(7, &[49, 49]);
    let (second, second_outputs) = distribution(8, &[32, 33, 33]);

    harness
        .pool_answers_request_extensions(vec![EXTENSION_TYPE_COINBASE_TRANSACTION_PAYOUTS])
        .await;
    harness.jds_negotiates(first).await;
    harness.jds_hands_out_tokens(6).await;
    constraints_sent(&harness.tp_sniffer).await;

    harness.tp_sends_template(template(1, true)).await;
    harness.tp_sends_prev_hash(1, 0x11).await;
    let _downstream = harness.open_channel().await;
    harness.tp_sends_template(template(2, true)).await;
    harness.tp_sends_prev_hash(2, 0x22).await;
    assert_eq!(custom_job_sent(&harness.pool_sniffer).await.1, Some(7));

    harness.jds_publishes(second).await;
    assert_eq!(
        constraints_sent(&harness.tp_sniffer).await,
        coinbase_output_constraints_message(second_outputs)
    );

    harness.tp_sends_template(template(3, false)).await;
    let (job, distribution_id) = custom_job_sent(&harness.pool_sniffer).await;
    assert_eq!(
        (distribution_id, jdc_outputs(&job).len()),
        (Some(7), 3),
        "a template sent before the new constraints took effect keeps the previous distribution"
    );

    harness.tp_sends_template(template(4, true)).await;
    harness.tp_sends_prev_hash(4, 0x44).await;
    let (job, distribution_id) = custom_job_sent(&harness.pool_sniffer).await;
    harness.jdc.shutdown().await;
    assert_eq!((distribution_id, jdc_outputs(&job).len()), (Some(8), 4));
}

/// A JDS that never answers the negotiation leaves JDC on the base protocol with that upstream.
#[tokio::test]
async fn silent_jds_leaves_jdc_on_the_base_protocol() {
    let harness = Harness::start(ConfigJDCMode::CoinbaseOnly).await;

    harness
        .pool_answers_request_extensions(vec![EXTENSION_TYPE_COINBASE_TRANSACTION_PAYOUTS])
        .await;
    harness.jds_receives_request_extensions().await;

    sent_by_jdc(
        &harness.jds_sniffer,
        "AllocateMiningJobToken",
        |message, _| {
            matches!(
                message,
                AnyMessageOwned::JobDeclaration(JobDeclarationOwned::AllocateMiningJobToken(_))
            )
            .then_some(())
        },
    )
    .await;
    let solo_output = TxOut {
        value: Amount::from_sat(0),
        script_pubkey: CoinbaseRewardScript::from_descriptor(JDC_COINBASE_REWARD_DESCRIPTOR)
            .unwrap()
            .script_pubkey(),
    };
    assert_eq!(
        constraints_sent(&harness.tp_sniffer).await,
        coinbase_output_constraints_message(vec![solo_output])
    );
    harness.jdc.shutdown().await;
}

/// The JDS publishes distributions but the pool declined the extension: a base protocol job has
/// no pool payout output to pay, so JDC falls back, here to solo mining.
#[tokio::test]
async fn pool_declining_the_extension_makes_jdc_fall_back() {
    let harness = Harness::start(ConfigJDCMode::CoinbaseOnly).await;
    let (message, distribution_outputs) = distribution(7, &[49, 49]);
    let solo_output = TxOut {
        value: Amount::from_sat(0),
        script_pubkey: CoinbaseRewardScript::from_descriptor(JDC_COINBASE_REWARD_DESCRIPTOR)
            .unwrap()
            .script_pubkey(),
    };
    let solo_constraints = coinbase_output_constraints_message(vec![solo_output]);
    assert_ne!(
        solo_constraints,
        coinbase_output_constraints_message(distribution_outputs),
        "the test tells solo mining apart by its constraints"
    );

    harness.pool_answers_request_extensions(vec![]).await;
    harness.jds_negotiates(message).await;

    // with the extension negotiated with the JDS, JDC sends no solo constraints unless it falls
    // back to solo mining
    sent_by_jdc(
        &harness.tp_sniffer,
        "solo CoinbaseOutputConstraints",
        |message, _| match message {
            AnyMessageOwned::TemplateDistribution(
                TemplateDistributionOwned::CoinbaseOutputConstraints(constraints),
            ) if constraints == solo_constraints => Some(()),
            _ => None,
        },
    )
    .await;
    harness.jdc.shutdown().await;
}

/// A JDS that agrees to the extension but publishes no distribution makes JDC fall back.
///
/// Runs on a multi-threaded runtime, as the JDC binary does: falling back drops the JDS
/// connection's buffer pool, whose `Drop` spins until every frame read from it is released, and
/// on a single thread the task holding such a frame can never run to release it.
#[tokio::test(flavor = "multi_thread")]
async fn jds_without_distribution_makes_jdc_fall_back() {
    let harness = Harness::start(ConfigJDCMode::CoinbaseOnly).await;
    let solo_output = TxOut {
        value: Amount::from_sat(0),
        script_pubkey: CoinbaseRewardScript::from_descriptor(JDC_COINBASE_REWARD_DESCRIPTOR)
            .unwrap()
            .script_pubkey(),
    };
    let solo_constraints = coinbase_output_constraints_message(vec![solo_output]);

    harness
        .pool_answers_request_extensions(vec![EXTENSION_TYPE_COINBASE_TRANSACTION_PAYOUTS])
        .await;
    let request_id = harness.jds_receives_request_extensions().await;
    harness
        .jds
        .send(AnyMessageOwned::Extensions(
            RequestExtensionsSuccessOwned {
                request_id,
                supported_extensions: vec![EXTENSION_TYPE_COINBASE_TRANSACTION_PAYOUTS]
                    .try_into()
                    .unwrap(),
            }
            .into(),
        ))
        .await
        .unwrap();

    sent_by_jdc(
        &harness.tp_sniffer,
        "solo CoinbaseOutputConstraints",
        |message, _| match message {
            AnyMessageOwned::TemplateDistribution(
                TemplateDistributionOwned::CoinbaseOutputConstraints(constraints),
            ) if constraints == solo_constraints => Some(()),
            _ => None,
        },
    )
    .await;
    assert!(
        !harness.jds_sniffer.has_message_type(
            MessageDirection::ToUpstream,
            stratum_apps::stratum_core::job_declaration_sv2::MESSAGE_TYPE_ALLOCATE_MINING_JOB_TOKEN
        ),
        "JDC must not continue with a JDS whose distribution never arrived"
    );
    harness.jdc.shutdown().await;
}
