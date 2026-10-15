use stratum_apps::stratum_core::{
    common_messages_sv2::{
        ChannelEndpointChangedOwned, ReconnectOwned, SetupConnectionErrorOwned,
        SetupConnectionSuccessOwned,
    },
    extensions_sv2::{
        EXTENSION_TYPE_COINBASE_TRANSACTION_PAYOUTS, MESSAGE_TYPE_SET_PAYOUT_DISTRIBUTION,
        RequestExtensionsErrorOwned, RequestExtensionsSuccessOwned, SetPayoutDistributionOwned,
    },
    handlers_sv2::{
        HandleCommonMessagesFromServerOwnedAsync, HandleExtensionsFromServerOwnedAsync,
    },
    parsers_sv2::{AnyMessageOwned, Tlv},
};
use tracing::{error, info, warn};

use crate::{
    error::{self, JDCError, JDCErrorKind},
    job_declarator::JobDeclarator,
};

#[cfg_attr(not(test), hotpath::measure_all)]
impl HandleCommonMessagesFromServerOwnedAsync for JobDeclarator {
    type Error = JDCError<error::JobDeclarator>;

    fn get_negotiated_extensions_with_server(
        &self,
        _server_id: Option<usize>,
    ) -> Result<Vec<u16>, Self::Error> {
        Ok(vec![])
    }

    async fn handle_setup_connection_success(
        &mut self,
        _server_id: Option<usize>,
        msg: SetupConnectionSuccessOwned,
        _tlv_fields: Option<&[Tlv]>,
    ) -> Result<(), Self::Error> {
        info!("Received: {}", msg);
        self.mode.activate();
        Ok(())
    }

    async fn handle_channel_endpoint_changed(
        &mut self,
        _server_id: Option<usize>,
        msg: ChannelEndpointChangedOwned,
        _tlv_fields: Option<&[Tlv]>,
    ) -> Result<(), Self::Error> {
        info!("Received: {}", msg);
        Ok(())
    }

    async fn handle_reconnect(
        &mut self,
        _server_id: Option<usize>,
        msg: ReconnectOwned,
        _tlv_fields: Option<&[Tlv]>,
    ) -> Result<(), Self::Error> {
        info!("Received: {}", msg);
        Ok(())
    }

    async fn handle_setup_connection_error(
        &mut self,
        _server_id: Option<usize>,
        msg: SetupConnectionErrorOwned,
        _tlv_fields: Option<&[Tlv]>,
    ) -> Result<(), Self::Error> {
        warn!("Received: {}", msg);
        Err(JDCError::fallback(JDCErrorKind::SetupConnectionError))
    }
}

#[cfg_attr(not(test), hotpath::measure_all)]
impl HandleExtensionsFromServerOwnedAsync for JobDeclarator {
    type Error = JDCError<error::JobDeclarator>;

    fn get_negotiated_extensions_with_server(
        &self,
        _server_id: Option<usize>,
    ) -> Result<Vec<u16>, Self::Error> {
        Ok(vec![])
    }

    async fn handle_request_extensions_success(
        &mut self,
        _server_id: Option<usize>,
        msg: RequestExtensionsSuccessOwned,
        _tlv_fields: Option<&[Tlv]>,
    ) -> Result<(), Self::Error> {
        info!("Received: {}", msg);
        if msg
            .supported_extensions
            .into_inner()
            .contains(&EXTENSION_TYPE_COINBASE_TRANSACTION_PAYOUTS)
        {
            self.coinbase_transaction_payouts_negotiated = true;
        } else {
            warn!(
                "JDS does not support Coinbase Transaction Payouts, continuing with the base protocol"
            );
        }
        Ok(())
    }

    async fn handle_request_extensions_error(
        &mut self,
        _server_id: Option<usize>,
        msg: RequestExtensionsErrorOwned,
        _tlv_fields: Option<&[Tlv]>,
    ) -> Result<(), Self::Error> {
        warn!("Received: {}", msg);
        warn!(
            "JDS does not support Coinbase Transaction Payouts, continuing with the base protocol"
        );
        Ok(())
    }

    async fn handle_set_payout_distribution(
        &mut self,
        _server_id: Option<usize>,
        msg: SetPayoutDistributionOwned,
        _tlv_fields: Option<&[Tlv]>,
    ) -> Result<(), Self::Error> {
        if !self.coinbase_transaction_payouts_negotiated {
            error!("JDS sent a payout distribution without the extension being negotiated");
            return Err(JDCError::fallback(JDCErrorKind::UnexpectedMessage(
                EXTENSION_TYPE_COINBASE_TRANSACTION_PAYOUTS,
                MESSAGE_TYPE_SET_PAYOUT_DISTRIBUTION,
            )));
        }
        self.forward_to_channel_manager(AnyMessageOwned::Extensions(msg.into()))
            .await
    }
}
