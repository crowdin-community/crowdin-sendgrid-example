const isDev = (process.env.NODE_ENV || 'development') !== 'production';
const useCopyAuth = false;

module.exports = {
  baseUrl: isDev
    ? "http://172.21.21.60:8001" // dev
    : "https://crowdin-typeform.herokuapp.com/",
  crowdinClientId: process.env.CROWDIN_CLIENT_ID || "trjBbjAue27tY7Hw0phH", // dev
  crowdinClientSecret: process.env.CROWDIN_CLIENT_SECRET || "n3fsQOtG3D2fqPhBwkBq02A7HnsmUzaxHIWy9FpN", // dev
  callbackUrl: isDev
    ? "http://172.21.21.60:8001/integration-token" // dev
    : "https://crowdin-typeform.herokuapp.com/integration-token",
  cryptoSecret: process.env.CRYPTO_SECRET || '78a10623f59sdhfghjgfjghac1b8e02ebde4b58f94',
  crowdinAuthUrl : isDev && useCopyAuth
    ? "http://accounts.yevhen.dev.crowdin.com/oauth/token" // Local copy auth service
    : "https://accounts.crowdin.com/oauth/token"
};