const isDev = (process.env.NODE_ENV || 'development') !== 'production';
const useCopyAuth = true;

const baseUrl = isDev
  ? "https://19a97905d635.ngrok.io" // dev
  : "https://testing-sendgridapp.herokuapp.com/"; // "https://sendgrid-crowdin.herokuapp.com/";

module.exports = {
  isDev,
  baseUrl,
  crowdinClientId: process.env.CROWDIN_CLIENT_ID || "trjBbjAue27tY7Hw0phH", // dev
  crowdinClientSecret: process.env.CROWDIN_CLIENT_SECRET || "n3fsQOtG3D2fqPhBwkBq02A7HnsmUzaxHIWy9FpN", // dev
  callbackUrl: `${baseUrl}integration-token`,
  cryptoSecret: process.env.CRYPTO_SECRET || '78a10623f59sdhfghjgfjghac1b8e02ebde4b58f94',
  crowdinAuthUrl : isDev && useCopyAuth
    ? "http://accounts.yevhen.dev.crowdin.com/oauth/token" // Local copy auth service
    : "https://accounts.crowdin.com/oauth/token",
  crowdinBaseApiUrl: 'http://yevhen111.yevhen.dev.crowdin.com/api/v2',
};