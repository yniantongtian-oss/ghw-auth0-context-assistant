const { auth } = require('express-oauth2-jwt-bearer');

/**
 * Build the first-party API guard. Production validates Auth0 RS256 access
 * tokens via the tenant JWKS. Tests pass a symmetric secret instead.
 */
function createCheckJwt(options = {}) {
  if (!options.audience) {
    throw new Error('audience is required to validate access tokens');
  }

  const shared = { audience: options.audience };
  if (options.clockTolerance != null) {
    shared.clockTolerance = options.clockTolerance;
  }

  if (options.secret) {
    if (!options.issuer) {
      throw new Error('issuer is required when validating symmetric tokens');
    }
    return auth({
      ...shared,
      issuer: options.issuer,
      secret: options.secret,
      tokenSigningAlg: options.tokenSigningAlg || 'HS256',
    });
  }

  if (!options.issuerBaseURL) {
    throw new Error('issuerBaseURL is required');
  }

  return auth({
    ...shared,
    issuerBaseURL: options.issuerBaseURL,
  });
}

module.exports = { createCheckJwt };
