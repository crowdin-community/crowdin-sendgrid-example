const axios = require('axios').default;
const { union } = require('lodash');

const { emitEvent } = require('./sockets');
const Mapping = require('./models/mapping');
const { catchRejection } = require('./helpers');

const updateDesignLibraryFile = async ( integrationClient, integrationTranslationFile, originIntegrationFile, translatedFilesData, index, fileName, subject ) => {
  if(integrationTranslationFile){
    return integrationClient.request({
      method: 'PATCH',
      url: `/v3/designs/${integrationTranslationFile.id}`,
      body: {
        subject,
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
        subject,
        generate_plain_content: true,
        html_content: translatedFilesData[index],
        categories: originIntegrationFile.categories,
      }
    })
  }
};

const updateDynamicTemplateFile = async ( integrationClient, integrationTranslationFile, originIntegrationFile, translatedFilesData, index, fileName, subject ) => {
  if(integrationTranslationFile && ((integrationTranslationFile.versions || [])[0] || {}).id){
    return integrationClient.request({
      method: 'PATCH',
      url: `/v3/templates/${integrationTranslationFile.id}/versions/${integrationTranslationFile.versions[0].id}`,
      body: {
        subject,
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
            subject,
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
      const translationsResponse = req.body;
      const projectId = res.origin.context.project_id;

      const mappedFiles = await Mapping.getFilesByDomainProjectId(res);
      const mappedFilesById = mappedFiles.reduce((acc, f) => ({...acc, [f.crowdinFileId]: f}), {});

      const filesTranslations = {};
      Object.keys(translationsResponse).forEach(fId => {
        if(mappedFilesById[fId]){
          filesTranslations[fId] = translationsResponse[fId];
        }
      });

      const translations = Object.keys(filesTranslations).reduce((acc, fileId) =>
        ([...acc, ...filesTranslations[fileId].map(lId =>
          ({fileId: fileId, languageId: lId})
        )]), []
      );

      const subjectTranslations = Object.values(filesTranslations).reduce((acc, translations) => union(acc, translations), []);

      let subjects = {};
      if(res.integration.metadataFileId){
        const buildLinks = await Promise.all(
          subjectTranslations.map(lId => crowdinApi.translationsApi.buildProjectFileTranslation(projectId, res.integration.metadataFileId, {targetLanguageId: lId, exportAsXliff: false}))
        );
        if(buildLinks.some(r => !(r.data || {}).url)){
          throw new Error('Some untranslated files were not exported due to the enabled "Skip untranslated files" option');
        }
        const buffers = await Promise.all(buildLinks.map(r => axios.get(r.data.url)));

        subjectTranslations.forEach( (lId, index) => {
          subjects[lId] = buffers[index].data;
        });
      }

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
        if(buildLinks.some(r => !(r.data || {}).url)){
          throw new Error('Some untranslated files were not exported due to the enabled "Skip untranslated files" option');
        }
        const buffers = await Promise.all(buildLinks.map(r => axios.get(r.data.url)));
        return buffers.map(b => b.data);
      })();

      const uploadedFiles = await Promise.all(translations.map( (t, index) => {
        const fileName = `${filesById[t.fileId].title}/${t.languageId}`;
        const mappedFile = mappedFilesById[t.fileId];
        const integrationTranslationFile = integrationFilesList.find(f => f.name === fileName);
        const originIntegrationFile =  integrationFilesList.find(f => f.id === mappedFile.integrationFileId);
        if(!(subjects[t.languageId] || {})[`${originIntegrationFile.id}__subject`] && !!res.integration.metadataFileId){
          throw new Error('Some untranslated files were not exported due to the enabled "Skip untranslated strings" option');
        }
        const subject = subjects[t.languageId][`${originIntegrationFile.id}__subject`];
        if(mappedFile.integrationDataType === 'Dynamic Templates'){
          return updateDynamicTemplateFile(integrationClient, integrationTranslationFile, originIntegrationFile, translatedFilesData, index, fileName, subject);
        } else {
          return updateDesignLibraryFile(integrationClient, integrationTranslationFile, originIntegrationFile, translatedFilesData, index, fileName, subject);
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