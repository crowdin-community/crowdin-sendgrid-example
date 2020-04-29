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
});

Integration.getApiClient = async (req, res) => {
  const integration = await Integration.findOne({where: {uid: res.clientId}});
  if(!integration) {
    // if we don't find Integration, we can't create Integration API client. Exit
    return res.status(404).send();
  }
  // initialize Integration API client and connect it to response object
  res.integration = integration;
  createIntegrationClient.setApiKey(decryptData(integration.integrationToken));
  res.integrationClient = createIntegrationClient;
  return new Promise (resolve => resolve());
};

Integration.Login = () => async (req, res) => {
  try {
    createIntegrationClient.setApiKey(req.body.token);
    try{
      const [requestStatus, body] = await createIntegrationClient.request({ method: 'GET', url: '/v3/designs' });
    } catch(e) {
      return res.status(200).json({error: 'Api key is not valid!'});
    }
    const integration = await Integration.findOne({where: {uid: res.clientId}});
    const params = {
      integrationToken: encryptData(req.body.token),
    };
    let result = null;
    if(integration) {
      result = await integration.update(params);
    } else {
      params.uid = res.clientId;
      result = await Integration.create(params);
    }
    res.status(200).json(result);
  } catch(e) {
    catchRejection('Cant update token', res)(e)
  }
};

Integration.getData = () => async (req, res) => {
  try {
    const client = res.integrationClient;
    const files = [{id: 'designLibrary', name: 'Design library', parent_id: 0, node_type: nodeTypes.FOLDER}];
    const [response, body] = await client.request({ method: 'GET', url: '/v3/designs' });
    if(response.statusCode !== 200) {
      catchRejection('Cant fetch data from integration', res)(response);
    } else {
      files.push(...body.result.map((item) => ({
        icon: '/assets/logo.svg',
        node_type: nodeTypes.FILE,
        parent_id: 'designLibrary',
        ...item
      })));
      res.send(files)
    }
  } catch(e) {
    catchRejection('Cant fetch data from integration', res)(e);
  }
};

module.exports = Integration;