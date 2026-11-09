const crypto = require('crypto');

const SECRET = 'test-secret-test-secret-test-secret';
const ISSUER = 'https://dev-wvxvhbnjrgvgn26x.us.auth0.com/';
const AUDIENCE = 'https://context-assistant.api';

function signToken(claims = {}, secret = SECRET) {
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    sub: 'auth0|ada',
    iat: now,
    exp: now + 3600,
    iss: ISSUER,
    aud: AUDIENCE,
    ...claims,
  };
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const data = `${header}.${body}`;
  const signature = crypto.createHmac('sha256', secret).update(data).digest('base64url');
  return `${data}.${signature}`;
}

function jwtConfig() {
  return {
    issuer: ISSUER,
    audience: AUDIENCE,
    secret: SECRET,
    tokenSigningAlg: 'HS256',
  };
}

module.exports = { SECRET, ISSUER, AUDIENCE, signToken, jwtConfig };
