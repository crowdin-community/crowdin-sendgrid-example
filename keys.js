const isDev = (process.env.NODE_ENV || 'development') !== 'production';
const useCopyAuth = true;

module.exports = {
  baseUrl: isDev
    ? "http://172.21.21.60:8000" // dev
    : "https://crowdin-typeform-app.herokuapp.com/",
  crowdinClientId: isDev
    ? "trjBbjAue27tY7Hw0phH"  // dev
    : "ikwEMWOH6b5gWiXo1Apv",
  crowdinClientSecret: isDev
    ? "n3fsQOtG3D2fqPhBwkBq02A7HnsmUzaxHIWy9FpN" // dev
    : "aD48fy1WV5agzZEdPcAv4QgJw1lWkJpDJh9PoNOY",
  integrationClientId: isDev
    ? "FzzC2UBbCjhNt9CYACYXvfo42P572xXhDkVoKKBkddtM" // dev
    : "6WayTi4aBJTGotMbUBFA8BtYj49hDjjywZfN1UhUxTEJ",
  integrationSecret: isDev
    ? "Ea3GVEYKJtJkQHzHXVJ5QueR2eeEaDXF1sbjG7TLZhbz" // dev
    : "22fdPAnX93mdsMXyx7wSPDJsydFbPaBrq8H47ni7sdHi",
  callbackUrl: isDev
    ? "http://172.21.21.60:8000/integration-token" // dev
    : "https://crowdin-typeform-app.herokuapp.com/integration-token",
  cryptoSecret: '78a10623f59sdhfghjgfjghac1b8e02ebde4b58f94',
  crowdinAuthUrl : isDev && useCopyAuth
    ? "http://accounts.yevhen.dev.crowdin.com/oauth/token" // Local copy auth service
    : "https://accounts.crowdin.com/oauth/token"
};