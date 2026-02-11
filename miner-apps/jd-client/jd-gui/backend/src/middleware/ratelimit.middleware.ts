import rateLimit from 'express-rate-limit';

// Only enable rate limiting in production
// During development/testing, users need unlimited requests to learn and experiment
const isProduction = process.env.NODE_ENV === 'production';

export const apiLimiter = rateLimit({
  windowMs: 10 * 60 * 1000, // 10 minutes
  max: isProduction ? 300 : 999999, // 300 requests per 10min in production (allows normal usage), unlimited in dev
  message: 'Too many requests from this IP, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => !isProduction, // Skip rate limiting entirely in development
});
