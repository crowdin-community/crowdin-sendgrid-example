const Mapping = require('./models/mapping');
const { nodeTypes } = require('./helpers');


function crowdinUpdate() {
  return (req, res) => {
    const integrationClient = res.integrationClient;
    const crowdinApi = res.crowdinApiClient;
    const fileIds = req.body.filter(f => f.node_type === nodeTypes.FILE);
    const projectId = res.origin.context.project_id;

    let integrationFiles = [];
    let integrationFilesList = {};

    integrationClient.request({
      method: 'GET',
      url: '/v3/designs'
    })
      .then(([response, body]) => {
        if(response.statusCode !== 200) {
          throw new Error(response.statusCode);
        } else {
          integrationFilesList = body.result.reduce((acc, item) => ({...acc, [item.id]: {...item}}), {})
        }
      })
      .catch(e => console.log('cant fetch forms list', e));
    Promise.all(
      fileIds.map(fid => integrationClient.request({
        method: 'GET',
        url: `/v3/designs/${fid.id}`
      }))
    )
      .then((values) => {
        integrationFiles = values;
        return Promise.all(
          values.map(([s, f]) => crowdinApi.uploadStorageApi.addStorage(`${f.id}.html`, f.html_content))
        )
      })
      .then(storageIds => {
        const addedFiles = storageIds.map((f, i) =>
          ({
            ...f.data,
            title: integrationFiles[i][1].name,
            integrationFileId: integrationFiles[i][1].id,
            integrationUpdatedAt: integrationFilesList[integrationFiles[i][1].id].updated_at
          })
        );

        return Promise.all(addedFiles.map(f => {
          return Mapping.findOne({where: {projectId: projectId, integrationFileId: f.integrationFileId}})
            .then(file => {
              if(!!file) {
                return crowdinApi.sourceFilesApi.getFile(projectId, file.crowdinFileId)
                  .then(() => {
                    return crowdinApi.sourceFilesApi.updateOrRestoreFile(projectId, file.crowdinFileId, {storageId: f.id})
                  })
                  .then(response => {
                    return file.update({crowdinUpdatedAt: response.data.updatedAt, integrationUpdatedAt: f.integrationUpdatedAt})
                  })
                  .catch(() => {

                    return crowdinApi.sourceFilesApi.createFile(projectId, {
                      storageId: f.id,
                      name: f.fileName,
                      title: f.title
                    })
                      .then(response => {
                        return file.update({
                          integrationUpdatedAt: f.integrationUpdatedAt,
                          crowdinUpdatedAt: response.data.updatedAt,
                          crowdinFileId: response.data.id,
                        })
                      })
                  });
              } else {
                return crowdinApi.sourceFilesApi.createFile(projectId, {
                  storageId: f.id,
                  name: f.fileName,
                  title: f.title
                })
                  .then(response => {
                    return Mapping.create({
                      domain: res.origin.domain,
                      projectId: projectId,
                      integrationUpdatedAt: f.integrationUpdatedAt,
                      crowdinUpdatedAt: response.data.updatedAt,
                      integrationFileId: f.integrationFileId,
                      crowdinFileId: response.data.id,
                    })
                  })
              }
            })
        }))
      })
      .then(responses => {
        res.json(responses);
      })
      .catch(e => {
        return res.status(500).send(e);
      });
  }
}

module.exports = crowdinUpdate;