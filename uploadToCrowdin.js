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
          editor: integrationFilesList[integrationFiles[i][1].id].editor,
          subject: integrationFilesList[integrationFiles[i][1].id].subject,
        })
      );

      const uploadedFiles = await Promise.all(addedFiles.map( async f => {
        const crowdinFile = await Mapping.findOne({where: {projectId: projectId, integrationFileId: f.integrationFileId}});
        console.log(f);
        if(!!crowdinFile) {
          try {
            await crowdinApi.sourceFilesApi.getFile(projectId, crowdinFile.crowdinFileId);
            const updatedFile = await crowdinApi.sourceFilesApi.updateOrRestoreFile(projectId, crowdinFile.crowdinFileId, {storageId: f.id});
            return crowdinFile.update({
              editor: f.editor,
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
              editor: f.editor,
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
            domain: res.origin.domain,
            projectId: projectId,
            integrationUpdatedAt: f.integrationUpdatedAt,
            crowdinUpdatedAt: newFile.data.updatedAt,
            integrationFileId: f.integrationFileId,
            crowdinFileId: newFile.data.id,
            categories: f.categories,
            editor: f.editor,
            subject: f.subject,
          });
        }
      }));

      res.json(uploadedFiles);
    } catch(e) {
      catchRejection('Cant upload files to Crowdin', res)(e);
    }
  }
}

module.exports = crowdinUpdate;