const { loadConfig } = require('./config');
const { createApp } = require('./app');
const { SettingsStore } = require('./store/settings-store');

require('dotenv').config();

function start() {
  const config = loadConfig();
  const store = new SettingsStore(config.settingsFile);
  const app = createApp({ config, store });
  const server = app.listen(config.port, () => {
    console.log(`Context assistant listening on ${config.auth0.baseURL}`);
    if (!config.auth0.enabled) {
      console.log('Auth0 login is not configured. Copy .env.example to .env and set the Regular Web App credentials.');
    }
    if (config.tokenVault.enabled) {
      console.log(`Token Vault calendar path is on (${config.tokenVault.connection}, ${config.tokenVault.exchange}).`);
    }
  });
  return server;
}

if (require.main === module) {
  start();
}

module.exports = { start };
