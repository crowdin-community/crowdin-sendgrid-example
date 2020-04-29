const _ = require('lodash');
const express = require('express');
const bodyParser = require('body-parser');

const db = require('./db_connect');
const config = require('./config');
const { catchRejection } = require('./helpers');
const PORT = process.env.PORT || 8001;
const middleware = require('./middleware.js');
const crowdinUpdate = require('./uploadToCrowdin');
const integrationUpdate = require('./uploadToIntegration');

const Mapping = require('./models/mapping');
const Integration = require('./models/integration');
const Organization = require('./models/organization');

const app = express();

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({extended: false}));

app.use("/polyfills", express.static(__dirname + '/polyfills'));
app.use("/assets", express.static(__dirname + '/assets'));

app.get('/', middleware.requireAuthentication, (req, res) => res.sendFile(__dirname + '/templates/app.html'));

app.get('/manifest.json', (req, res) => res.json(_.pick(config, 'identifier', 'name', 'baseUrl', 'authentication', 'events', 'scopes', 'modules')));

app.get('/status', middleware.requireAuthentication, async (req, res) => {
  try {
    const organization = await Organization.findOne({where: {uid: res.origin.domain}});
    const integration = await Integration.findOne({where: {uid: res.clientId}});
    res.json({isInstalled: !!organization, isLoggedIn: !!integration});
  } catch(e) {
    catchRejection('Some problem to fetch organization or integration', res)(e);
  }
});

app.post('/integration-login', middleware.requireAuthentication, Integration.Login());

app.get('/integration-log-out', middleware.requireAuthentication, middleware.withIntegration, async (req, res) => {
  try {
    await res.integration.destroy();
    res.status(204).send()
  } catch(e) {
    catchRejection('Cant destroy integration', res)(e);
  }
});

app.get('/integration-data', middleware.requireAuthentication, middleware.withIntegration, Integration.getData());

app.get('/crowdin-data', middleware.requireAuthentication, middleware.withCrowdinToken, Organization.getProjectFiles());

app.post('/installed', Organization.install());

app.post('/get-file-progress', middleware.requireAuthentication, middleware.withCrowdinToken, Organization.getFileProgress());

app.get('/get-project-data', middleware.requireAuthentication, middleware.withCrowdinToken, Organization.getProjectData());

app.post('/upload-to-crowdin', middleware.requireAuthentication, middleware.withIntegration, middleware.withCrowdinToken, crowdinUpdate());

app.post('/upload-to-integration', middleware.requireAuthentication, middleware.withIntegration, middleware.withCrowdinToken, integrationUpdate());

// ------------------------------ start routes for debugging only ---------------------------
if(process.env.NODE_ENV !== 'production') {
  app.get('/mapping', async (req, res) => {
    try {
      const mappedFiles = await Mapping.findAll();
      res.json(mappedFiles);
    } catch(e) {
      catchRejection('Cant fetch mappings', res)(e);
    }
  });

  app.get('/organizations', async (req, res) => {
    try {
      const organizations = await Organization.findAll()
      res.json(organizations);
    } catch(e) {
      catchRejection('Cnat fetch organizations', res)(e);
    }
  });

  app.get('/integrations', async (req, res) => {
    try {
      const integrations = await Integration.findAll();
      res.json(integrations);
    } catch(e) {
      catchRejection('Cant fetch integrations', res)(e);
    }
  });
}
// ------------------------------ end routes for debugging only ---------------------------

db.sync({force: false}).then(function() {
  app.listen(PORT, () => {
    console.log(`Crowdin apps listening on ${PORT}! Good luck!!!`);
  });
});