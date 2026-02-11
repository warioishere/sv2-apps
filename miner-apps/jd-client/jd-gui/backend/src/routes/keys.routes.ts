import { Router, Request, Response } from 'express';
import * as secp256k1 from '@noble/secp256k1';
import bs58check from 'bs58check';
import { logger } from '../utils/logger';

const router = Router();

router.post('/generate', async (req: Request, res: Response) => {
  try {
    // Generate private key
    const privateKey = secp256k1.utils.randomPrivateKey();
    const publicKey = secp256k1.getPublicKey(privateKey, true); // compressed

    // Encode as Base58Check
    const privateKeyBase58 = bs58check.encode(Buffer.from(privateKey));
    const publicKeyBase58 = bs58check.encode(Buffer.from(publicKey));

    logger.info('Generated new keypair');

    res.json({
      success: true,
      keys: {
        public_key: publicKeyBase58,
        secret_key: privateKeyBase58
      }
    });
  } catch (error) {
    const err = error as Error;
    logger.error(`Error generating keys: ${err.message}`);
    res.status(500).json({
      success: false,
      error: err.message
    });
  }
});

export default router;
