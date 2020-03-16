const _ = require('underscore');
const express = require('express');
const bodyParser = require('body-parser');

const db = require('./db');
const config = require('./config');
const helper = require('./helpers');
const PORT = process.env.PORT || 8000;
const catchRejection = helper.catchRejection;
const middleware = require('./middleware.js')(db);
const crowdinUpdate = require('./uploadToCrowdin');
const typeformUpdate = require('./uploadToIntegration');

const app = express();

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({extended: false}));

app.get('/assets/logo.png', (req, res) => res.sendFile(__dirname + '/assets/logo.png'));

app.get('/', middleware.requireAuthentication, (req, res) => res.sendFile(__dirname + '/templates/app.html'));

app.get('/manifest.json', (req, res) => res.json(_.pick(config, 'identifier', 'name', 'baseUrl', 'authentication', 'events', 'scopes', 'modules')));

app.get('/status', middleware.requireAuthentication, (req, res) => {
  let status = {isInstalled: false, isLoggedIn: false};
  db.organization.findOne({where: {uid: res.origin.domain}})
    .then(organization => {
      status.isInstalled = !!organization;
      return db.integration.findOne({where: {uid: res.clientId}})
    })
    .then(integration => {
      status.isLoggedIn = !!integration;
      return res.json(status);
    })
    .catch(catchRejection('Some problem to fetch organization or integration', res))
  });

app.get('/integration-login', middleware.requireAuthentication, db.integration.getLoginUrl());

app.get('/integration-log-out', middleware.requireAuthentication, middleware.withIntegration, (req, res) => {
  res.integration.destroy()
    .then(() => res.status(204).send())
    .catch(catchRejection('Cant destroy integration', res));
});

app.get('/integration-token', db.integration.setupToken());

app.get('/integration-data', middleware.requireAuthentication, middleware.withIntegration, db.integration.getData());

app.get('/crowdin-data', middleware.requireAuthentication, middleware.withCrowdinToken, middleware.withIntegration, db.organization.getProjectFiles(db));

app.post('/installed', db.organization.install());

app.post('/get-file-progress', middleware.requireAuthentication, middleware.withCrowdinToken, db.organization.getFileProgress());

app.get('/get-project-data', middleware.requireAuthentication, middleware.withCrowdinToken, db.organization.getProjectData());

app.post('/upload-to-crowdin', middleware.requireAuthentication, middleware.withIntegration, middleware.withCrowdinToken, crowdinUpdate(db));

app.post('/upload-to-integration', middleware.requireAuthentication, middleware.withIntegration, middleware.withCrowdinToken, typeformUpdate());

// app.get('/mapping', (req, res) => {
//   db.mapping.findAll()
//     .then(r => res.json(r))
//     .catch(catchRejection('Cant fetch mappings', res));
// });
//
// app.get('/organizations', (req, res) => {
//   db.organization.findAll()
//   .then(organizations => {
//     res.json(organizations);
//   })
//   .catch(catchRejection('Cnat fetch organizations', res));
// });
//
// app.get('/integrations', (req, res) => {
//   db.integration.findAll()
//     .then(integrations => {
//       res.json(integrations);
//     })
//     .catch(catchRejection('Cant fetch integrations', res));
// });

db.sequelize.sync({force: false}).then(function() {
  app.listen(PORT, () => {
    console.log(`Crowdin apps listening on ${PORT}! Good luck!!!`);
  });
});