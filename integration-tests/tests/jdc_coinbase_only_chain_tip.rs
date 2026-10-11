use integration_tests_sv2::{
    POOL_COINBASE_REWARD_ADDRESS,
    interceptor::MessageDirection,
    mock_roles::{MockDownstream, MockUpstream, WithSetup},
    utils::get_available_address,
};
use jd_client_sv2::config::ConfigJDCMode;
use std::time::Duration;
use stratum_apps::{
    config_helpers::CoinbaseRewardScript,
    stratum_core::{
        bitcoin::{Amount, TxOut, consensus::serialize},
        channels_sv2::outputs::deserialize_outputs,
        common_messages_sv2::Protocol,
        job_declaration_sv2::{
            AllocateMiningJobTokenSuccessOwned, MESSAGE_TYPE_ALLOCATE_MINING_JOB_TOKEN_SUCCESS,
        },
        mining_sv2::{
            MESSAGE_TYPE_OPEN_EXTENDED_MINING_CHANNEL_SUCCESS, OpenExtendedMiningChannelOwned,
            OpenExtendedMiningChannelSuccessOwned,
        },
        parsers_sv2::{
            AnyMessageOwned, JobDeclarationOwned, MiningOwned, TemplateDistributionOwned,
        },
        template_distribution_sv2::{NewTemplateOwned, SetNewPrevHashOwned},
    },
};

const COINBASE_TX_VALUE_REMAINING: u64 = 5_000_000_000;
// How long the test waits for the `SetCustomMiningJob` built on a chain tip update.
const CUSTOM_JOB_WINDOW: Duration = Duration::from_secs(10);

// A future template carrying only the witness commitment, so every coinbase output that is not
// part of `coinbase_tx_outputs` comes from JDC.
fn future_template(template_id: u64) -> NewTemplateOwned {
    NewTemplateOwned {
        template_id,
        future_template: true,
        version: 536_870_912,
        coinbase_tx_version: 2,
        coinbase_prefix: vec![82, 0]
            .try_into()
            .expect("coinbase prefix must fit into B0255"),
        coinbase_tx_input_sequence: u32::MAX,
        coinbase_tx_value_remaining: COINBASE_TX_VALUE_REMAINING,
        coinbase_tx_outputs_count: 1,
        coinbase_tx_outputs: vec![
            0, 0, 0, 0, 0, 0, 0, 0, 38, 106, 36, 170, 33, 169, 237, 226, 246, 28, 63, 113, 209,
            222, 253, 63, 169, 153, 223, 163, 105, 83, 117, 92, 105, 6, 137, 121, 153, 98, 180,
            139, 235, 216, 54, 151, 78, 140, 249,
        ]
        .try_into()
        .expect("coinbase outputs must fit into B064K"),
        coinbase_tx_locktime: 0,
        merkle_path: vec![].try_into().expect("empty merkle path must be valid"),
    }
}

/// In coinbase-only mode, a chain tip update activates the last future template, and JDC has to
/// put a `SetCustomMiningJob` on it right away: without one, the upstream channel has no job on
/// the new tip until a non-future template arrives.
///
/// The JDS hands out its pool payout output with a value of 0, as JDP requires, so JDC has to
/// assign the template revenue to it before building the job.
#[tokio::test]
async fn jdc_coinbase_only_sends_custom_job_on_chain_tip_update() {
    custom_job_on_chain_tip_update(1).await;
}

/// A chain tip update before the upstream channel is open has no job to spend a token on, so it
/// must leave JDC's tokens alone: JDC holds two, and two such updates must still leave it able to
/// put a custom job on the next tip.
#[tokio::test]
async fn jdc_coinbase_only_keeps_its_tokens_until_the_upstream_channel_opens() {
    custom_job_on_chain_tip_update(2).await;
}

// Hands JDC two tokens, moves the chain tip `tip_updates_before_open` times before a downstream
// opens the upstream channel, moves it once more, and checks the custom job JDC sends for it.
async fn custom_job_on_chain_tip_update(tip_updates_before_open: u8) {
    integration_tests_sv2::start_tracing();

    let mock_tp_addr = get_available_address();
    let mock_tp_sender = MockUpstream::new(
        mock_tp_addr,
        WithSetup::yes_with_defaults(Protocol::TemplateDistributionProtocol, 0),
    )
    .start()
    .await;

    let mock_pool_addr = get_available_address();
    let mock_pool_sender = MockUpstream::new(
        mock_pool_addr,
        WithSetup::yes_with_defaults(Protocol::MiningProtocol, 0),
    )
    .start()
    .await;
    let (pool_sniffer, pool_sniffer_addr) =
        integration_tests_sv2::start_sniffer("jdc-pool", mock_pool_addr, false, vec![], None);

    let mock_jds_addr = get_available_address();
    let mock_jds_sender = MockUpstream::new(
        mock_jds_addr,
        WithSetup::yes_with_defaults(Protocol::JobDeclarationProtocol, 0),
    )
    .start()
    .await;
    let (jds_sniffer, jds_sniffer_addr) =
        integration_tests_sv2::start_sniffer("jdc-jds", mock_jds_addr, false, vec![], None);

    let (jdc, jdc_addr, _) = integration_tests_sv2::start_jdc(
        &[(pool_sniffer_addr, jds_sniffer_addr)],
        integration_tests_sv2::sv2_tp_config(mock_tp_addr),
        vec![],
        vec![],
        false,
        Some(ConfigJDCMode::CoinbaseOnly),
    );

    let pool_payout_script =
        CoinbaseRewardScript::from_descriptor(&format!("addr({POOL_COINBASE_REWARD_ADDRESS})"))
            .expect("pool reward descriptor must be valid")
            .script_pubkey();
    let coinbase_outputs = serialize(&vec![TxOut {
        value: Amount::from_sat(0),
        script_pubkey: pool_payout_script.clone(),
    }]);

    // answer the two token requests JDC sends after the JDS handshake
    for token in 0_u64..2 {
        let token_request = loop {
            match jds_sniffer.next_message_from_downstream() {
                Some((
                    _,
                    AnyMessageOwned::JobDeclaration(JobDeclarationOwned::AllocateMiningJobToken(
                        message,
                    )),
                )) => break message,
                _ => tokio::time::sleep(Duration::from_secs(1)).await,
            }
        };
        mock_jds_sender
            .send(AnyMessageOwned::JobDeclaration(
                JobDeclarationOwned::AllocateMiningJobTokenSuccess(
                    AllocateMiningJobTokenSuccessOwned {
                        request_id: token_request.request_id,
                        mining_job_token: token
                            .to_le_bytes()
                            .try_into()
                            .expect("u64 token must fit into B0255"),
                        coinbase_outputs: coinbase_outputs
                            .clone()
                            .try_into()
                            .expect("serialized coinbase outputs must fit into B064K"),
                    },
                ),
            ))
            .await
            .expect("mock JDS should send the token");
    }

    // the chain tip may only move once JDC holds both tokens, or it has none to lose
    for _ in 0..2 {
        jds_sniffer
            .wait_for_message_type_and_clean_queue(
                MessageDirection::ToDownstream,
                MESSAGE_TYPE_ALLOCATE_MINING_JOB_TOKEN_SUCCESS,
            )
            .await;
    }
    tokio::time::sleep(Duration::from_millis(500)).await;

    for template_id in 1..=tip_updates_before_open as u64 {
        mock_tp_sender
            .send(AnyMessageOwned::TemplateDistribution(
                TemplateDistributionOwned::NewTemplate(future_template(template_id)),
            ))
            .await
            .expect("mock TP should send NewTemplate");
        mock_tp_sender
            .send(AnyMessageOwned::TemplateDistribution(
                TemplateDistributionOwned::SetNewPrevHash(SetNewPrevHashOwned {
                    template_id,
                    prev_hash: [0x10 + template_id as u8; 32].into(),
                    ntime_start: 1_700_000_000 + template_id as u32,
                    n_bits: 0x1d00ffff,
                    target: [0xff; 32].into(),
                }),
            ))
            .await
            .expect("mock TP should send SetNewPrevHash");
    }

    let (downstream_sniffer, downstream_sniffer_addr) =
        integration_tests_sv2::start_sniffer("downstream-jdc", jdc_addr, false, vec![], None);
    let downstream_sender = MockDownstream::new(
        downstream_sniffer_addr,
        WithSetup::yes_with_defaults(Protocol::MiningProtocol, 0),
    )
    .start()
    .await;
    downstream_sender
        .send(AnyMessageOwned::Mining(
            MiningOwned::OpenExtendedMiningChannel(OpenExtendedMiningChannelOwned {
                request_id: 1,
                user_identity: "coinbase-only-tip".try_into().unwrap(),
                nominal_hash_rate: 1_000.0,
                max_target: [0xff; 32].into(),
                min_extranonce_size: 0,
            }),
        ))
        .await
        .expect("mock downstream should open an extended channel");

    let open_channel_request = loop {
        match pool_sniffer.next_message_from_downstream() {
            Some((_, AnyMessageOwned::Mining(MiningOwned::OpenExtendedMiningChannel(message)))) => {
                break message;
            }
            _ => tokio::time::sleep(Duration::from_secs(1)).await,
        }
    };
    mock_pool_sender
        .send(AnyMessageOwned::Mining(
            MiningOwned::OpenExtendedMiningChannelSuccess(OpenExtendedMiningChannelSuccessOwned {
                request_id: open_channel_request.request_id,
                channel_id: 9,
                target: [0xff; 32].into(),
                extranonce_size: open_channel_request.min_extranonce_size,
                extranonce_prefix: vec![0; 4]
                    .try_into()
                    .expect("extranonce prefix must fit into B032"),
                group_channel_id: 1,
            }),
        ))
        .await
        .expect("mock pool should open the upstream extended channel");

    // the downstream channel is built from the current future template, so the chain tip only
    // moves once that channel is open
    downstream_sniffer
        .wait_for_message_type(
            MessageDirection::ToDownstream,
            MESSAGE_TYPE_OPEN_EXTENDED_MINING_CHANNEL_SUCCESS,
        )
        .await;

    // the chain tip moves: a new future template, then the prev hash that activates it
    let new_prev_hash = [0xee; 32];
    let template_id = tip_updates_before_open as u64 + 1;
    mock_tp_sender
        .send(AnyMessageOwned::TemplateDistribution(
            TemplateDistributionOwned::NewTemplate(future_template(template_id)),
        ))
        .await
        .expect("mock TP should send NewTemplate");
    mock_tp_sender
        .send(AnyMessageOwned::TemplateDistribution(
            TemplateDistributionOwned::SetNewPrevHash(SetNewPrevHashOwned {
                template_id,
                prev_hash: new_prev_hash.into(),
                ntime_start: 1_700_000_600,
                n_bits: 0x1d00ffff,
                target: [0xff; 32].into(),
            }),
        ))
        .await
        .expect("mock TP should send SetNewPrevHash");

    let custom_job = tokio::time::timeout(CUSTOM_JOB_WINDOW, async {
        loop {
            match pool_sniffer.next_message_from_downstream() {
                Some((_, AnyMessageOwned::Mining(MiningOwned::SetCustomMiningJob(message)))) => {
                    break message;
                }
                _ => tokio::time::sleep(Duration::from_millis(200)).await,
            }
        }
    })
    .await
    .expect("JDC must send a SetCustomMiningJob for the new chain tip");

    jdc.shutdown().await;

    assert_eq!(custom_job.prev_hash.to_array(), new_prev_hash);
    let outputs = deserialize_outputs(custom_job.coinbase_tx_outputs.to_owned_bytes())
        .expect("custom job coinbase outputs must deserialize");
    assert_eq!(outputs[0].script_pubkey, pool_payout_script);
    assert_eq!(outputs[0].value.to_sat(), COINBASE_TX_VALUE_REMAINING);
}
