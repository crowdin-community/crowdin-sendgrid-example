const axios = require('axios');
const { PatchOperation } = require('@crowdin/crowdin-api-client');

const { emitEvent } = require('./sockets');
const Mapping = require('./models/mapping');
const { nodeTypes, catchRejection } = require('./helpers');


function crowdinUpdate() {
  return async (req, res) => {
    try {
      const integrationClient = res.integrationClient;
      const crowdinApi = res.crowdinApiClient;
      const fileIds = req.body.filter(f => f.node_type === nodeTypes.FILE);
      const projectId = res.origin.context.project_id;
      const [getListResponse, getListBody] = await integrationClient.request({ method: 'GET', url: '/v3/designs' });
      if(getListResponse.statusCode !== 200) {
        throw new Error(`cant fetch forms list statusCode: ${getListResponse.statusCode}`);
      }
      const integrationFilesList = getListBody.result.reduce((acc, item) => ({...acc, [item.id]: {...item}}), {});
      const integrationFiles = await Promise.all(
        fileIds.map(fid => integrationClient.request({ method: 'GET', url: `/v3/designs/${fid.id}` }))
      );
      const storageIds = await Promise.all(
        integrationFiles.map(([s, f]) => crowdinApi.uploadStorageApi.addStorage(`${f.id}.html`, f.html_content))
      );

      const addedFiles = storageIds.map((f, i) =>
        ({
          ...f.data,
          title: integrationFiles[i][1].name,
          integrationFileId: integrationFiles[i][1].id,
          integrationUpdatedAt: integrationFilesList[integrationFiles[i][1].id].updated_at,
          categories: JSON.stringify(integrationFilesList[integrationFiles[i][1].id].categories),
          subject: integrationFilesList[integrationFiles[i][1].id].subject,
        })
      );

      const uploadedFiles = await Promise.all(addedFiles.map( async f => {
        const crowdinFile = await Mapping.findOne({
          where: {
            projectId: projectId,
            domain: res.origin.domain,
            integrationFileId: f.integrationFileId
          }
        });
        if(!!crowdinFile) {
          try {
            await crowdinApi.sourceFilesApi.getFile(projectId, crowdinFile.crowdinFileId);
            try {
              await axios({
                method: 'patch',
                url: `${crowdinApi.uploadStorageApi.url}/projects/${projectId}/files/${crowdinFile.crowdinFileId}`,
                data: [{value: `${f.title}`, op:PatchOperation.REPLACE , path: '/title'}],
                headers: {
                  Authorization: `Bearer ${res.crowdinToken}`,
                }
              })
            } catch(e) {
              console.log('cant update title', e);
            }
            const updatedFile = await crowdinApi.sourceFilesApi.updateOrRestoreFile(projectId, crowdinFile.crowdinFileId, {storageId: f.id});
            return crowdinFile.update({
              subject: f.subject,
              categories: f.categories,
              crowdinUpdatedAt: updatedFile.data.updatedAt,
              integrationUpdatedAt: f.integrationUpdatedAt,
            });
          } catch(e) {
            const newFile = await crowdinApi.sourceFilesApi.createFile(projectId, {
              storageId: f.id,
              name: f.fileName,
              title: f.title
            });
            return crowdinFile.update({
              integrationUpdatedAt: f.integrationUpdatedAt,
              crowdinUpdatedAt: newFile.data.updatedAt,
              crowdinFileId: newFile.data.id,
              categories: f.categories,
              subject: f.subject,
            });
          }
        } else {
          const newFile = await crowdinApi.sourceFilesApi.createFile(projectId, {
            storageId: f.id,
            name: f.fileName,
            title: f.title
          });

          return Mapping.create({
            domain: `${res.origin.domain || res.origin.context.organization_id}`,
            projectId: projectId,
            integrationUpdatedAt: f.integrationUpdatedAt,
            crowdinUpdatedAt: newFile.data.updatedAt,
            integrationFileId: f.integrationFileId,
            crowdinFileId: newFile.data.id,
            categories: f.categories,
            subject: f.subject,
          });
        }
      }));
      if(!res.headersSent) {
        return res.json(uploadedFiles);
      }

      emitEvent({
        error: false,
        refreshCrowdin: true,
        message: 'Async files upload to Crowdin finished',
      }, res);
    } catch(e) {
      catchRejection('Cant upload files to Crowdin', res)(e);
    }
  }
}

module.exports = crowdinUpdate;