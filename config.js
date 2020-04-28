const keys = require('./keys');

const manifest = {
  "identifier": "sendgrid-app",
  "name": "SendGrid",
  "baseUrl": keys.baseUrl,
  "authentication": {
      "type": "authorization_code",
      "clientId": keys.crowdinClientId
  },
  "events": {
      "installed": "/installed"
  },
  "scopes": [
      "project"
  ],
  "modules": {
      "integrations": [
          {
              "key": "sendgrid",
              "name": "SendGrid",
              "description": "Upload and localize your marketing content from SendGrid",
              "logo": "/assets/logo.svg",
              "url": "/"
          }
      ]
  },
};

module.exports = manifest;