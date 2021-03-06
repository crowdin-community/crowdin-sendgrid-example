const keys = require('./keys');
const jwt = require('jsonwebtoken');

const { catchRejection } = require('./helpers');
const Integration = require('./models/integration');
const Organization = require('./models/organization');

module.exports = {
  requireAuthentication: (req, res, next) => {

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
        res.clientId = `${res.origin.domain || res.origin.context.organization_id}__${res.origin.context.project_id}__${res.origin.sub}`;
        setTimeout(() => {
          if(!res.headersSent) {
            res.status(503).json({ error: 'Response took too much time. \nIt will continue running on background'})
          }
        }, 25000);
        next();
      }
    });
  },
  withIntegration: async (req, res, next) => {
    // Get integration credentials create Integration API client and connect to response
    try {
      await Integration.getApiClient(req, res);
      next();
    } catch(e) {
      catchRejection('Can\'t find integration by id', res)(e);
    }
  },
  withCrowdinToken: async (req, res, next) => {
    // Get organization credentials create Crowdin API client and connect to response
    try {
      await Organization.getOrganization(res);
      next();
    } catch(e) {
      catchRejection('Can\'t find organization by id', res)(e);
    }
  }
};