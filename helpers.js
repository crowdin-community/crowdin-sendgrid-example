const crypto = require("crypto-js");
const keys = require('./keys');

const catchRejection = (message, res) => e => {
  // here the right place to console.log what goes wrong
  console.log('message ---------------------------------------->', message);
  console.log('e ---------------------------------------------->', e);
  let errorText = message;
  if(e){
    if(typeof e === 'string'){
      errorText = e;
    }
    if(e.message && typeof e.message === 'string') {
      errorText = e.message
    }
    if(e.error && typeof e.error === 'object') {
      errorText = JSON.stringify(e.error);
    }
  }
  res.status(500).json(JSON.stringify({error: errorText}));
};

const nodeTypes = {
  FOLDER: '0',
  FILE: '1',
  BRANCH: '2',
};

const encryptData = (data) => crypto.AES.encrypt(data, keys.cryptoSecret).toString();

const decryptData = (encryptedData) => {
  const bytes = crypto.AES.decrypt(encryptedData, keys.cryptoSecret);
  return bytes.toString(crypto.enc.Utf8);
};

module.exports = {catchRejection, encryptData, decryptData, nodeTypes};