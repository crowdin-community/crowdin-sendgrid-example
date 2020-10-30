const crypto = require("crypto-js");
const keys = require('./keys');
const { emitEvent } = require('./sockets');

const catchRejection = (message, res) => e => {
  // here the right place to console.log what goes wrong
  // console.log('message ---------------------------------------->', message);
  // console.log('e ---------------------------------------------->', e);
  // console.log('e ---------------------------------------------->', e.errors[0].error);
  let errorText = message;
  if(e){
    if(typeof e === 'string'){
      errorText = e;
    }
    if(e.message && typeof e.message === 'string') {
      try {
        errorText = JSON.parse(e.message).description;
      } catch(err) {
        errorText = e.message;
      }
    }
    if(e.error && typeof e.error === 'object') {
      errorText = JSON.stringify(e.error);
    }
  }
  if(e.code === 403){
    res.integration.destroy()
      .then(() => {
        emitEvent({
          error: false,
          reload: true,
          message: `Looks like you are not authenticated`,
        }, res);
        return res.status(401).send();
      });
  }

  if(!res.headersSent) {
    return res.status(500).json({error: errorText});
  }

  emitEvent({
    error: true,
    message: `Async job failed \n ${errorText}`,
    e,
  }, res);
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