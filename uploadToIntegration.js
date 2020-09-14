const axios = require('axios').default;

const { emitEvent } = require('./sockets');
const Mapping = require('./models/mapping');
const { catchRejection } = require('./helpers');

const updateDesignLibraryFile = async ( integrationClient, integrationTranslationFile, originIntegrationFile, translatedFilesData, index, fileName ) => {
  if(integrationTranslationFile){
    return integrationClient.request({
      method: 'PATCH',
      url: `/v3/designs/${integrationTranslationFile.id}`,
      body: {
        subject: originIntegrationFile.subject,
        generate_plain_content: true,
        html_content: translatedFilesData[index],
        categories: originIntegrationFile.categories,
      }
    })
  } else {
    return integrationClient.request({
      method: 'POST',
      url: `/v3/designs`,
      body: {
        name: fileName,
        subject: originIntegrationFile.subject,
        generate_plain_content: true,
        html_content: translatedFilesData[index],
        categories: originIntegrationFile.categories,
      }
    })
  }
};

const updateDynamicTemplateFile = async ( integrationClient, integrationTranslationFile, originIntegrationFile, translatedFilesData, index, fileName ) => {
  if(integrationTranslationFile){
    return integrationClient.request({
      method: 'PATCH',
      url: `/v3/templates/${integrationTranslationFile.id}/versions/${integrationTranslationFile.versions[0].id}`,
      body: {
        generate_plain_content: true,
        html_content: translatedFilesData[index],
      }
    })
  } else {
    return integrationClient.request({
      method: 'POST',
      url: `/v3/templates`,
      body: {
        name: fileName,
        generation: originIntegrationFile.generation,
      }
    })
      .then(([resp, data]) => {
        return integrationClient.request({
          method: 'POST',
          url: `/v3/templates/${data.id}/versions`,
          body: {
            name: fileName,
            html_content: translatedFilesData[index],
          }
        })
      })
  }
};

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

      const mappedFiles = await Mapping.getFilesByDomainProjectId(res);
      const mappedFilesById = mappedFiles.reduce((acc, f) => ({...acc, [f.crowdinFileId]: f}), {});

      const [integrationListStatus, integrationListBody] = await integrationClient.request({ method: 'GET', url: '/v3/designs' });
      const [integrationTemplatesStatus, integrationTemplatesBody] = await integrationClient.request({ method: 'GET', url: '/v3/templates?generations=dynamic,legacy'});
      if(integrationListStatus.statusCode !== 200 || integrationTemplatesStatus.statusCode !== 200) {
        throw new Error(`cant fetch forms list statusCode: ${integrationListStatus.statusCode}`);
      }
      const integrationFilesList = [...integrationListBody.result, ...integrationTemplatesBody.templates];
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
        const originIntegrationFile =  integrationFilesList.find(f => f.id === mappedFile.integrationFileId);
        if(mappedFile.integrationDataType === 'Dynamic Templates'){
          return updateDynamicTemplateFile(integrationClient, integrationTranslationFile, originIntegrationFile, translatedFilesData, index, fileName);
        } else {
          return updateDesignLibraryFile(integrationClient, integrationTranslationFile, originIntegrationFile, translatedFilesData, index, fileName);
        }
      }));

      if(!res.headersSent) {
        return res.status(200).json(uploadedFiles);
      }

      emitEvent({
        error: false,
        refreshIntegration: true,
        message: 'Async files upload to SendGrid finished',
      }, res);
    } catch(e) {
      catchRejection('Cant upload files to integration', res)(e);
    }
  }
}

module.exports = integrationUpdate;