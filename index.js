const _ = require('lodash');
const express = require('express');
const bodyParser = require('body-parser');

const db = require('./db_connect');
const config = require('./config');
const { catchRejection } = require('./helpers');
const PORT = process.env.PORT || 8000;
const middleware = require('./middleware.js');
const crowdinUpdate = require('./uploadToCrowdin');
const typeformUpdate = require('./uploadToIntegration');

const Mapping = require('./models/mapping');
const Integration = require('./models/integration');
const Organization = require('./models/organization');

const app = express();

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({extended: false}));

app.use("/polyfills", express.static(__dirname + '/polyfills'));

app.get('/assets/logo.png', (req, res) => res.sendFile(__dirname + '/assets/logo.png'));

app.get('/', middleware.requireAuthentication, (req, res) => res.sendFile(__dirname + '/templates/app.html'));

app.get('/manifest.json', (req, res) => res.json(_.pick(config, 'identifier', 'name', 'baseUrl', 'authentication', 'events', 'scopes', 'modules')));

app.get('/status', middleware.requireAuthentication, (req, res) => {
  let status = {isInstalled: false, isLoggedIn: false};
  Organization.findOne({where: {uid: res.origin.domain}})
    .then(organization => {
      status.isInstalled = !!organization;
      return Integration.findOne({where: {uid: res.clientId}})
    })
    .then(integration => {
      status.isLoggedIn = !!integration;
      return res.json(status);
    })
    .catch(catchRejection('Some problem to fetch organization or integration', res))
  });

app.get('/integration-login', middleware.requireAuthentication, Integration.getLoginUrl());

app.get('/integration-log-out', middleware.requireAuthentication, middleware.withIntegration, (req, res) => {
  res.integration.destroy()
    .then(() => res.status(204).send())
    .catch(catchRejection('Cant destroy integration', res));
});

app.get('/integration-token', Integration.setupToken());

app.get('/integration-data', middleware.requireAuthentication, middleware.withIntegration, Integration.getData());

app.get('/crowdin-data', middleware.requireAuthentication, middleware.withCrowdinToken, middleware.withIntegration, Organization.getProjectFiles(db));

app.post('/installed', Organization.install());

app.post('/get-file-progress', middleware.requireAuthentication, middleware.withCrowdinToken, Organization.getFileProgress());

app.get('/get-project-data', middleware.requireAuthentication, middleware.withCrowdinToken, Organization.getProjectData());

app.post('/upload-to-crowdin', middleware.requireAuthentication, middleware.withIntegration, middleware.withCrowdinToken, crowdinUpdate(db));

app.post('/upload-to-integration', middleware.requireAuthentication, middleware.withIntegration, middleware.withCrowdinToken, typeformUpdate());

// ------------------------------ start routes for debugging only ---------------------------
if(process.env.NODE_ENV !== 'production') {
  app.get('/mapping', (req, res) => {
    Mapping.findAll()
      .then(r => res.json(r))
      .catch(catchRejection('Cant fetch mappings', res));
  });

  app.get('/organizations', (req, res) => {
    Organization.findAll()
    .then(organizations => {
      res.json(organizations);
    })
    .catch(catchRejection('Cnat fetch organizations', res));
  });

  app.get('/integrations', (req, res) => {
    Integration.findAll()
      .then(integrations => {
        res.json(integrations);
      })
      .catch(catchRejection('Cant fetch integrations', res));
  });
}
// ------------------------------ end routes for debugging only ---------------------------

db.sync({force: false}).then(function() {
  app.listen(PORT, () => {
    console.log(`Crowdin apps listening on ${PORT}! Good luck!!!`);
  });
});