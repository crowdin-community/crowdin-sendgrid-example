const axios = require('axios');
const { find } = require('lodash');
const { PatchOperation } = require('@crowdin/crowdin-api-client');

const { emitEvent } = require('./sockets');
const Mapping = require('./models/mapping');
const { nodeTypes, catchRejection } = require('./helpers');

const getFileContent = file => {
  if(file.html_content){
    return file.html_content;
  }
  if(file.versions){
    let version = find(file.versions, ({active}) => !!active);
    if(!version){
      version = file.versions[0];
    }
    return version ? version.html_content : 'Add a version to this dynamic template in order to start editing its contents.';
  }
  return '';
};

let crowdinFolders = [];
let pendingFolders = {};

const folderFindFunction = (name, parentId) => f =>
  f.name === name && (parentId === 0 || f.directoryId === parentId || f.branchId === parentId);

const getFolderId = async (crowdinApi, projectId, parentId, name) => {
  try {
    let folder = find(crowdinFolders, folderFindFunction(name, parentId));
    if(!folder) {
      const folders = await crowdinApi.sourceFilesApi.listProjectDirectories(projectId, undefined, undefined, 500);
      const resFolders = folders.data.map(({data}) => ({...data, node_type: nodeTypes.FOLDER}));
      crowdinFolders.push(...resFolders);
      folder = find(resFolders, folderFindFunction(name, parentId));
      if(!folder && pendingFolders[`${name}__${parentId}`]) {
        return await getFolderId(crowdinApi, projectId, parentId, name);
      }
      if(!folder && !pendingFolders[`${name}__${parentId}`]) {
        pendingFolders[`${name}__${parentId}`] = true;
        const newFolder = await crowdinApi.sourceFilesApi.createDirectory(projectId, {name: name, ...parentId > 0 ? {directoryId: parentId} : {}});
        crowdinFolders.push(newFolder.data);
        folder = newFolder.data;
        delete pendingFolders[`${name}__${parentId}`];
      }
    }
    return folder.id;
  } catch(e) {
    console.log(e);
  }
};

function crowdinUpdate() {
  return async (req, res) => {
    try {
      const integrationClient = res.integrationClient;
      const crowdinApi = res.crowdinApiClient;
      const fileIds = req.body.filter(f => f.node_type === nodeTypes.FILE);
      const projectId = res.origin.context.project_id;

      const filesByIntegrationFileId = fileIds.reduce((acc, file) => ({...acc, [file.id]: file}), {});

      const integrationFiles = await Promise.all(
        fileIds.map(fid => integrationClient.request({
          method: 'GET',
          url: fid.parent_id === 'Design library'
            ? `/v3/designs/${fid.id}`
            : `/v3/templates/${fid.id}`
        }))
      );
      const storageIds = await Promise.all(
        integrationFiles.map(([s, f]) => crowdinApi.uploadStorageApi.addStorage(`${f.id}.html`, getFileContent(f)))
      );

      const getSubject = (i, prefix = '') => {
        if(integrationFiles[i][1].subject){
          return {[`${prefix}subject`]: integrationFiles[i][1].subject};
        } else if(integrationFiles[i][1].versions) {
          let version = find(integrationFiles[i][1].versions, ({active}) => !!active);
          if(!version){
            version = integrationFiles[i][1].versions[0];
          }
          return version ? { [`${prefix}subject`]: version.subject } : {};
        }
        return {}
      };

      const addedFiles = storageIds.map((f, i) =>
        ({
          ...f.data,
          title: integrationFiles[i][1].name,
          integrationFileId: integrationFiles[i][1].id,
          integrationDataType: filesByIntegrationFileId[integrationFiles[i][1].id].parent_id,
          integrationUpdatedAt: filesByIntegrationFileId[integrationFiles[i][1].id].updated_at,
          ...filesByIntegrationFileId[integrationFiles[i][1].id].categories ? {categories: JSON.stringify(filesByIntegrationFileId[integrationFiles[i][1].id].categories)} : {},
          ...getSubject(i),
        })
      );

      const integrationDirectory = await getFolderId(crowdinApi, projectId, 0, 'SendGrid integration');

      const subjects = integrationFiles.reduce((acc, [status, file], index) => ({...acc, ...getSubject(index, `${file.id}__`)}), {});
      await updateSubjects(subjects, res, integrationDirectory);

      const uploadedFiles = await Promise.all(addedFiles.map( async f => {
        const crowdinFile = await Mapping.findOne({
          where: {
            projectId: projectId,
            domain: `${res.origin.domain || res.origin.context.organization_id}`,
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
            const updatedFile = await crowdinApi.sourceFilesApi.updateOrRestoreFile(projectId, crowdinFile.crowdinFileId, {
              storageId: f.id
            });
            return crowdinFile.update({
              subject: f.subject,
              categories: f.categories,
              integrationDataType: f.integrationDataType,
              crowdinUpdatedAt: updatedFile.data.updatedAt,
              integrationUpdatedAt: f.integrationUpdatedAt,
            });
          } catch(e) {
            const directoryId = await getFolderId(crowdinApi, projectId, integrationDirectory, filesByIntegrationFileId[f.integrationFileId].parent_id);
            const newFile = await crowdinApi.sourceFilesApi.createFile(projectId, {
              storageId: f.id,
              directoryId,
              name: f.fileName,
              title: f.title
            });
            return crowdinFile.update({
              integrationUpdatedAt: f.integrationUpdatedAt,
              integrationDataType: f.integrationDataType,
              crowdinUpdatedAt: newFile.data.updatedAt,
              crowdinFileId: newFile.data.id,
              categories: f.categories,
              subject: f.subject,
            });
          }
        } else {
          const directoryId = await getFolderId(crowdinApi, projectId, integrationDirectory, filesByIntegrationFileId[f.integrationFileId].parent_id);
          const newFile = await crowdinApi.sourceFilesApi.createFile(projectId, {
            storageId: f.id,
            directoryId,
            name: f.fileName,
            title: f.title
          });

          return Mapping.create({
            domain: `${res.origin.domain || res.origin.context.organization_id}`,
            projectId: projectId,
            integrationUpdatedAt: f.integrationUpdatedAt,
            integrationDataType: f.integrationDataType,
            crowdinUpdatedAt: newFile.data.updatedAt,
            integrationFileId: f.integrationFileId,
            crowdinFileId: newFile.data.id,
            categories: f.categories,
            subject: f.subject,
          });
        }
      }));
      crowdinFolders = [];
      pendingFolders = {};
      if(!res.headersSent) {
        return res.json(uploadedFiles);
      }

      emitEvent({
        error: false,
        refreshCrowdin: true,
        message: 'Async files upload to Crowdin finished',
      }, res);
    } catch(e) {
      crowdinFolders = [];
      pendingFolders = {};
      catchRejection('Cant upload files to Crowdin', res)(e);
    }
  }
}

const updateSubjects = async (updatedSubjects, res, integrationRootDirectory) => {

  const projectId = res.origin.context.project_id;
  const crowdinApi = res.crowdinApiClient;

  let metadataFileId = res.integration.metadataFileId;

  try {
    if(!metadataFileId) {
      const integrationRootFiles = await crowdinApi.sourceFilesApi.listProjectFiles(projectId, null, integrationRootDirectory);
      metadataFileId = ((integrationRootFiles.data.find(f => f.data.name === 'SendGridIntegrationMetaData.json') || {}).data || {}).id;
      if(!metadataFileId){
        throw new Error(`It's ok go to create file`);
      }
    }

    const subjectsFileLink = await crowdinApi.sourceFilesApi.downloadFile(projectId, metadataFileId);
    const subjectsFileData = await axios({
      method: 'get',
      url: subjectsFileLink.data.url,
    });

    const subjects = subjectsFileData.data;

    const storageId = await crowdinApi.uploadStorageApi.addStorage(`SendGridIntegrationMetaData.json`, JSON.stringify({...subjects, ...updatedSubjects}));

    return crowdinApi.sourceFilesApi.updateOrRestoreFile(projectId, metadataFileId, {
      storageId: storageId.data.id
    });

  } catch(e) {

    const storageId = await crowdinApi.uploadStorageApi.addStorage(`SendGridIntegrationMetaData.json`, JSON.stringify(updatedSubjects));

    const newFile = await crowdinApi.sourceFilesApi.createFile(projectId, {
      storageId: storageId.data.id,
      directoryId: integrationRootDirectory,
      name: 'SendGridIntegrationMetaData.json',
      title: 'SendGrid Integration Meta Data'
    });

    return res.integration.update({
      metadataFileId: `${newFile.data.id}`,
    });
  }
};

module.exports = crowdinUpdate;