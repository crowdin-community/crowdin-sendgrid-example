const keys = require('./keys');

const manifest = {
  "identifier": "type-form-app",
  "name": "Typeform",
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
              "key": "typeform_app_test",
              "name": "Typeform Integration",
              "description": "Translate your forms and surveys from Typeform to reach your audience in their native language",
              "logo": "/assets/logo.png",
              "url": "/"
          }
      ]
  },
  // crowdin client secret
  "clientSecret": keys.crowdinClientSecret,

  "integrationClientId": keys.integrationClientId,
  "integrationSecret": keys.integrationSecret,
  "callbackUrl": keys.callbackUrl,

  scope: [
    'forms:read',
    'accounts:read',
    'themes:read',
    'responses:read',
    'workspaces:read',
    'forms:write',
    'themes:write',
    'responses:write',
    'workspaces:write',
  ].join('+')
};

module.exports = manifest;