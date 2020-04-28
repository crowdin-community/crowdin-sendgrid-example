const Sequelize = require('sequelize');

const createIntegrationClient = require('@sendgrid/client');

const db = require('../db_connect');
const { decryptData, encryptData, catchRejection, nodeTypes } = require('./../helpers');

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
  return Integration.findOne({where: {uid: res.clientId}})
    .then((integration) => {
      if(!integration) {
        // if we don't find Integration, we can't create Integration API client. Exit
        return res.status(404).send();
      }
      // initialize Integration API client and connect it to response object
      res.integration = integration;
      createIntegrationClient.setApiKey(decryptData(integration.integrationToken));
      res.integrationClient = createIntegrationClient;
      return new Promise (resolve => resolve());
    })
};

Integration.Login = () => (req, res) => {
  Integration.findOne({where: {uid: res.clientId}})
    .then((integration) => {
      let params = {
        integrationToken: encryptData(req.body.token),
      };
      if(integration) {
        return integration.update(params);
      } else {
        params.uid = res.clientId;
        return Integration.create(params);
      }
    })
    .then(() => res.status(204).send())
    .catch(catchRejection('Cant update token', res))
};

Integration.getData = () => (req, res) => {
  const client = res.integrationClient;
  const files = [{id: 'designLibrary', name: 'Design library', parent_id: 0, node_type: nodeTypes.FOLDER}];
  client.request({
    method: 'GET',
    url: '/v3/designs'
  })
    .then(([response, body]) => {
      if(response.statusCode !== 200) {
        throw new Error(response.statusCode);
      } else {
        files.push(...body.result.map((item) => ({
          icon: '/assets/logo.svg',
          node_type: nodeTypes.FILE,
          parent_id: 'designLibrary',
          ...item
        })));
        res.send(files)
      }
    })
    .catch(catchRejection('Cant fetch data from integration', res));
};

module.exports = Integration;