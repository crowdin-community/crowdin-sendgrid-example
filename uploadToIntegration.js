const axios = require('axios').default;

const Mapping = require('./models/mapping');
const { catchRejection } = require('./helpers');

function integrationUpdate() {
  return async (req, res) => {
    try {
      const integrationClient = res.integrationClient;
      const crowdinApi = res.crowdinApiClient;
      const filesTranslations = req.body;
      const projectId = res.origin.context.project_id;

      const translations = Object.keys(filesTranslations).reduce((acc, fileId) =>
        ([...acc, ...filesTranslations[fileId].map(lId =>
          ({fileId: fileId, languageId: lId})
        )]), []
      );

      const mappedFiles = await Promise.all(Object.keys(filesTranslations).map( key => Mapping.findAll({where: {crowdinFileId: key}})));
      const mappedFilesById = mappedFiles.map(f => f[0]).reduce((acc, f) => ({...acc, [f.crowdinFileId]: f}), {});

      const [integrationListStatus, integrationListBody] = await integrationClient.request({ method: 'GET', url: '/v3/designs' });
      if(integrationListStatus.statusCode !== 200) {
        throw new Error(`cant fetch forms list statusCode: ${integrationListStatus.statusCode}`);
      }
      const integrationFilesList = integrationListBody.result;
      const crowdinFiles = await Promise.all(Object.keys(filesTranslations).map( fId => crowdinApi.sourceFilesApi.getFile(projectId, fId)));
      const filesById = crowdinFiles.reduce((acc, fileData) => ({...acc, [`${fileData.data.id}`]: fileData.data}), {});

      const translatedFilesData = await ( async () => {
        const buildLinks = await Promise.all(
          translations.map(t => crowdinApi.translationsApi.buildProjectFileTranslation(projectId, t.fileId, {targetLanguageId: t.languageId, exportAsXliff: false}))
        );
        const buffers = await Promise.all(buildLinks.map(r => axios.get(r.data.url)));
        return buffers.map(b => b.data);
      })();

      const uploadedFiles = await Promise.all(translations.map( (t, index) => {
        const fileName = `${filesById[t.fileId].title}/${t.languageId}`;
        const mappedFile = mappedFilesById[t.fileId];
        const integrationTranslationFile = integrationFilesList.find(f => f.name === fileName);
        if(integrationTranslationFile){
          return integrationClient.request({
            method: 'PATCH',
            url: `/v3/designs/${integrationTranslationFile.id}`,
            body: {
              subject: mappedFile.subject,
              generate_plain_content: true,
              html_content: translatedFilesData[index],
              categories: JSON.parse(mappedFile.categories),
            }
          })
        } else {
          return integrationClient.request({
            method: 'POST',
            url: `/v3/designs`,
            body: {
              name: fileName,
              subject: mappedFile.subject,
              generate_plain_content: true,
              html_content: translatedFilesData[index],
              categories: JSON.parse(mappedFile.categories),
            }
          })
        }
      }));

      res.status(200).json(uploadedFiles);
    } catch(e) {
      catchRejection('Cant upload files to integration', res)(e);
    }
  }
}

module.exports = integrationUpdate;