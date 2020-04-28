const axios = require('axios').default;

const { catchRejection } = require('./helpers');

// const supportedLanguages = [
//   { name: 'Catalan', code: 'ca' },
//   { name: 'Chinese (simplified)', code: 'zh-CN' },
//   { name: 'Chinese (traditional)', code: 'zh-TW' },
//   { name: 'Croatian', code: 'hr' },
//   { name: 'Czech', code: 'cs' },
//   { name: 'Danish', code: 'da' },
//   { name: 'Dutch', code: 'nl' },
//   { name: 'English', code: 'en' },
//   { name: 'Estonian', code: 'et' },
//   { name: 'Finnish', code: 'fi' },
//   { name: 'French', code: 'fr' },
//   { name: 'Greek', code: 'el' },
//   { name: 'German', code: 'de' },
//   { name: 'Hungarian', code: 'hu' },
//   { name: 'Italian', code: 'it' },
//   { name: 'Japanese', code: 'ja' },
//   { name: 'Korean', code: 'ko' },
//   { name: 'Norwegian', code: 'no' },
//   { name: 'Polish', code: 'pl' },
//   { name: 'Portuguese', code: 'pt' },
//   { name: 'Russian', code: 'ru' },
//   { name: 'Spanish', code: 'es' },
//   { name: 'Swedish', code: 'sv' },
//   { name: 'Turkish', code: 'tr' },
//   { name: 'Ukrainian', code: 'uk' }
// ].map(l => l.code);

function integrationUpdate() {
  return (req, res) => {
    const integrationClient = res.integrationClient;
    const crowdinApi = res.crowdinApiClient;
    const formsTranslations = req.body;
    const projectId = res.origin.context.project_id;

    const translations = Object.keys(formsTranslations).reduce((acc, fileId) =>
      ([...acc, ...formsTranslations[fileId].map(lId =>
        ({fileId: fileId, languageId: lId})
      )]), []
    );

    let filesById = {};
    let fullFormsById = {};
    let integrationFilesList = [];
    integrationClient.request({
      method: 'GET',
      url: '/v3/designs'
    })
      .then( ([response, body]) => {
        integrationFilesList = body.result;
        return Promise.all(Object.keys(formsTranslations).map( fId => crowdinApi.sourceFilesApi.getFile(projectId, fId)))
      })
      .then( responses => {
        filesById = responses.reduce((acc,fileData) => ({...acc, [`${fileData.data.id}`]: fileData.data}), {});
        return Promise.all(Object.values(filesById).map(({name}) => integrationClient.request({method: 'GET', url: `/v3/designs/${name.replace('.html','')}`})))
      })
      .then( responses => {
        fullFormsById = responses.reduce((acc, [status, form]) => ({...acc, [`${form.id}`]: form}), {});
        return Promise.all(translations.map(t => crowdinApi.translationsApi.buildProjectFileTranslation(projectId, t.fileId, {targetLanguageId: t.languageId, exportAsXliff: false})))
      })
      .then( responses => {
        return Promise.all(responses.map(r => axios.get(r.data.url)))
      })
      .then( buffers => {
        const translatedFilesData = buffers.map(b => b.data);

        return Promise.all(translations.map((t, index) => {
          const fileName = `${filesById[t.fileId].title}/${t.languageId}`;
          const integrationTranslationFile = integrationFilesList.find(f => f.name === fileName);

          if(integrationTranslationFile){
            return integrationClient.request({
              method: 'PATCH',
              url: `/v3/designs/${integrationTranslationFile.id}`,
              body: {
                html_content: translatedFilesData[index],
                generate_plain_content: true,
              }
            })
          } else {
            return integrationClient.request({
              method: 'POST',
              url: `/v3/designs`,
              body: {
                name: fileName,
                html_content: translatedFilesData[index],
                plain_content: "",
                generate_plain_content: true,
              }
            })
          }
        }));
      })
      .then(responses => {
        res.status(200).json(responses);
      })
      .catch(catchRejection('Cant upload files to integration', res));
  }
}

module.exports = integrationUpdate;