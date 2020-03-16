const keys = require('./keys');
const jwt = require('jsonwebtoken');
const helper = require('./helpers');
const catchRejection = helper.catchRejection;

module.exports = function(db) {
  return {
    requireAuthentication: function(req, res, next) {

      const origin = req.query['origin'];
      const clientId = req.query['client_id'];
      const tokenJwt = req.query['tokenJwt'];

      if(!origin || !clientId || !tokenJwt || clientId !== keys.crowdinClientId) {
        return res.status(401).send();
      }

      jwt.verify(tokenJwt, keys.crowdinClientSecret, (err, decoded) => {
        if(err) {
          res.status(401).send();
        } else {
          res.origin = decoded;
          res.clientId = `${res.origin.domain}__${res.origin.context.project_id}`;
          return next();
        }
      });
    },
    withIntegration: (req, res, next) => {
      db.integration.getApiClient(req, res)
        .then(() => next())
        .catch(catchRejection('Can\'t find integration by id', res))
    },
    withCrowdinToken: (req, res, next) => {
      db.organization.getOrganization(res)
        .then(() => next())
        .catch(catchRejection('Can\'t find organization by id', res));
    }
  }
};