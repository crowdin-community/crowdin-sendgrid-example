const axios = require('axios');
const qs = require('querystring');
const jwt = require('jsonwebtoken');
const Sequelize = require('sequelize');

const keys = require('./../keys');
const config = require('./../config');
const {createClient: createIntegrationClient} = require('@typeform/api-client');

const db = require('../db_connect');
const { decryptData, encryptData, catchRejection } = require('./../helpers');

// Database structure Integration table
const Integration = db.define('Integration', {
  uid: {
    type: Sequelize.STRING,
    allowNull: false,
    unique: true,
  },
  integrationToken: {
    type: Sequelize.STRING(10000),
  },
  integrationRefreshToken: {
    type: Sequelize.STRING(10000),
  },
  integrationTokenExpiresIn: {
    type: Sequelize.STRING,
  },
});

Integration.getApiClient = (req, res) => {
  return Integration.findOne({where: {uid: `${res.origin.domain}__${res.origin.context.project_id}`}})
    .then((integration) => {
      if(!integration) {
        // if we don't find Integration, we can't create Integration API client. Exit
        return res.status(404).send();
      }
      // initialize Integration API client and connect it to response object
      res.integration = integration;
      res.integrationClient = createIntegrationClient({token: decryptData(integration.integrationToken)});
      return new Promise (resolve => resolve());
    })
};

Integration.getLoginUrl = () => (req, res) => {
  let clientId = null;
  try {
    clientId = jwt.sign({clientId: res.clientId}, keys.crowdinClientSecret);
  } catch(e) {
    catchRejection('Cant sign JWT token', res)(e);
  }
  res.json({url: `https://api.typeform.com/oauth/authorize?client_id=${keys.integrationClientId}&redirect_uri=${keys.callbackUrl}&scope=${config.scope}&state=${clientId}`});
};

Integration.setupToken = () => (req, res) => {
  var clientId = null;
  try {
    clientId = (jwt.verify(req.query.state, keys.crowdinClientSecret) || {}).clientId;
  } catch(e) {
    catchRejection('Cant decode JWT', res)(e);
  }
  const payload = {
    grant_type: 'authorization_code',
    code: req.query.code,
    client_id: keys.integrationClientId,
    client_secret: keys.integrationSecret,
    redirect_uri: keys.callbackUrl,
  };
  let tokenRes = {};
  return axios.post(`https://api.typeform.com/oauth/token`, qs.stringify(payload))
    .then((response) => {
      tokenRes = response;
      return Integration.findOne({where: {uid: clientId}})
    })
    .then((integration) => {
      let params = {
        integrationTokenExpiresIn: (new Date().getTime()/1000) + +tokenRes.data.expires_in,
        integrationToken: encryptData(tokenRes.data.access_token),
        integrationTokenType: tokenRes.data.token_type,
        integrationRefreshToken: encryptData(tokenRes.data.refresh_token || ''),
      };
      if(integration) {
        return integration.update(params);
      } else {
        params.uid = clientId;
        return Integration.create(params);
      }
    })
    .then(() => res.sendFile('closeAuthModal.html', {root: __dirname + '/../templates'}))
    .catch(catchRejection('Cant update token', res));
};

Integration.getData = () => (req, res) => {
  const typeformAPI = res.integrationClient;
  typeformAPI.forms.list()
    .then((response) => {
      res.send(response.items.map(({title, ...rest}) => ({
        name: title,
        icon: '/assets/logo.svg',
        parent_id: 0,
        ...rest
      })));
    })
    .catch(catchRejection('Cant fetch data from integration', res));
};

module.exports = Integration;