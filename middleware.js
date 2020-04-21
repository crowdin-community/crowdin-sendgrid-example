const keys = require('./keys');
const jwt = require('jsonwebtoken');

const { catchRejection } = require('./helpers');
const Integration = require('./models/integration');
const Organization = require('./models/organization');

module.exports = {
  requireAuthentication: function(req, res, next) {

    const origin = req.query['origin'];
    const clientId = req.query['client_id'];
    const tokenJwt = req.query['tokenJwt'];

    if(!origin || !clientId || !tokenJwt || clientId !== keys.crowdinClientId) {
      return res.status(401).send('No origin');
    }

    jwt.verify(tokenJwt, keys.crowdinClientSecret, (err, decoded) => {
      if(err) {
        res.status(401).send('Cant verify');
      } else {
        res.origin = decoded;
        res.clientId = `${res.origin.domain}__${res.origin.context.project_id}`;
        return next();
      }
    });
  },
  withIntegration: (req, res, next) => {
    // Get integration credentials create Integration API client and connect to response
    Integration.getApiClient(req, res)
      .then(() => next())
      .catch(catchRejection('Can\'t find integration by id', res))
  },
  withCrowdinToken: (req, res, next) => {
    // Get organization credentials create Crowdin API client and connect to response
    Organization.getOrganization(res)
      .then(() => next())
      .catch(catchRejection('Can\'t find organization by id', res));
  }
};