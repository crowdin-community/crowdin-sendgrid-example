const axios = require('axios');
const Sequelize = require('sequelize');
const crowdin = require('@crowdin/crowdin-api-client').default;

const keys = require('./../keys');
const db = require('../db_connect');
const Mapping = require('./mapping');
const { decryptData, encryptData, catchRejection, nodeTypes } = require('./../helpers');

const Organization = db.define('organization', {
  uid: {
    type: Sequelize.STRING,
    allowNull: false,
    unique: true,
  },
  accessToken: {
    type: Sequelize.STRING(10000),
    allowNull: false,
  },
  refreshToken: {
    type: Sequelize.STRING(10000),
    allowNull: false,
  },
  expire: {
    type: Sequelize.STRING,
    allowNull: false,
  }
});

// Get project data used for showing lists of translations for each file
Organization.getProjectData = () => async (req, res) => {
  try {
    const crowdinApi = res.crowdinApiClient;
    const projectId = res.origin.context.project_id;
    const languages = await crowdinApi.languagesApi.listSupportedLanguages(500, 0);
    const languagesById = languages.data.reduce( (acc, l) => ({...acc, [l.data.id]: l.data}), {});
    const project = await crowdinApi.projectsGroupsApi.getProject(projectId);
    const projectTargetLanguages = project.data.targetLanguageIds.map(lId => languagesById[lId]);
    res.json({...project.data, projectTargetLanguages});
  } catch(e) {
    catchRejection('Cant fetch file progress', res)(e);
  }
};

Organization.getFileProgress = () => async (req, res) => {
  try {
    const crowdinApi = res.crowdinApiClient;
    const projectId = res.origin.context.project_id;
    // exact request to get progress
    const progress = await crowdinApi.translationStatusApi.getFileProgress(projectId, req.body.fileId);
    // Send back object with fileId as key and progress.data without useless data nesting as value
    res.json({[`${req.body.fileId}`]: progress.data.map(({data}) => ({...data}))});
  } catch(e) {
    catchRejection('Cant fetch file progress', res)(e);
  }
};

Organization.getProjectFiles = () => async (req, res) => {
  try {
    const crowdinApi = res.crowdinApiClient;
    const projectId = res.origin.context.project_id;
    const uploadedFiles = await Mapping.getFilesByDomainProjectId(res);
    let files = [];
    if(uploadedFiles && !!uploadedFiles.length){
      const foldersRes = await crowdinApi.sourceFilesApi.listProjectDirectories(projectId, undefined, undefined, 500);
      const filesRes = await Promise.all(uploadedFiles.map(f => crowdinApi.sourceFilesApi.getFile(projectId, f.crowdinFileId).catch(e => ({}))));
      files = filesRes.filter(fr => !!fr.data).map(({data}) => data).map(({directoryId, branchId, name, title, ...rest}) => ({
        ...rest,
        name: title || name,
        title: title ? name : undefined,
        node_type: nodeTypes.FILE,
        parent_id: directoryId || branchId || 0
      }));
      files.push(...foldersRes.data.map(({data}) => ({...data, node_type: '0', parent_id: data.branchId || data.directoryId || 0})));
    }

    //  -------------------------------    all files without mapping -----------------------------------------
    // const [foldersRes, filesRes, branchesRes] = await Promise.all([
    //   crowdinApi.sourceFilesApi.listProjectDirectories(projectId, undefined, undefined, 500),
    //   crowdinApi.sourceFilesApi.listProjectFiles(projectId, undefined, undefined, 500),
    //   crowdinApi.sourceFilesApi.listProjectBranches(projectId, undefined, 500)
    // ]);
    // files.push(...foldersRes.data.map(({data}) => ({...data, node_type: nodeTyps.FOLDER})));
    // files.push(...filesRes.data.map(({data}) => ({...data, node_type: nodeTyps.FILE})));
    // files.push(...branchesRes.data.map(({data}) => ({...data, node_type: nodeTyps.BRANCH})));
    // res.json(files.map(({directoryId, branchId, ...rest}) => ({
    //   ...rest,
    //   parent_id: directoryId || branchId || 0
    // })));
    //  -------------------------------    all fiiles without mapping -----------------------------------------

    res.json(files);
  } catch(e) {
    catchRejection('Cant fetch project files', res)(e);
  }
};

Organization.install = () => async (req, res) => {
  try {
    const organization = await Organization.findOne({where: {uid: `${req.body.domain || req.body.organizationId}`}});
    const credentials = await axios.post(keys.crowdinAuthUrl, {
      grant_type: 'authorization_code',
      client_id: keys.crowdinClientId,
      client_secret: keys.crowdinClientSecret,
      code: req.body.code,
    });
    const params = {
      uid: `${req.body.domain || req.body.organizationId}`,
      refreshToken: encryptData(credentials.data.refresh_token),
      accessToken: encryptData(credentials.data.access_token),
      expire: new Date().getTime()/1000 + +credentials.data.expires_in
    };
    if(!!organization){
      await organization.update(params);
    } else {
      await Organization.create(params);
    }
    res.status(204).send();
  } catch(e) {
    catchRejection('Cant install application', res)(e)
  }
};

Organization.getOrganization = (res) => {
  return new Promise ( async (resolve, reject) => {
    try {
      const organization = await Organization.findOne({where: {uid: `${res.origin.domain || res.origin.context.organization_id}`}});
      if(!organization) {
        return reject('Can\'t find organization by id');
      }
      const isExpired = +organization.expire < +new Date().getTime() / 1000;
      if(!isExpired) {
        res.crowdinToken = decryptData(organization.accessToken);

        res.crowdinApiClient = new crowdin({
          token: decryptData(organization.accessToken),
          ...keys.isDev ? {baseUrl: keys.crowdinBaseApiUrl} : {},
          ...((res.origin || {}).domain) ? { organization: organization.uid } : {}
        });
        resolve();
      } else {
        const credentials = await axios.post(keys.crowdinAuthUrl, {
          grant_type: 'refresh_token',
          client_id: keys.crowdinClientId,
          client_secret: keys.crowdinClientSecret,
          refresh_token: decryptData(organization.refreshToken),
        });
        const updatedOrg = await organization.update({
          refreshToken: encryptData(credentials.data.refresh_token),
          accessToken: encryptData(credentials.data.access_token),
          expire: (new Date().getTime() / 1000) + credentials.data.expires_in
        });
        res.crowdinToken = decryptData(updatedOrg.accessToken);

        const options = {
          token: decryptData(updatedOrg.accessToken)
        }

        if (res.origin.domain) {
          options.organization = updatedOrg.uid;
        }

        res.crowdinApiClient = new crowdin(options);
        resolve()
      }
    } catch(e) {
      reject('Can\'t renew access token');
    }
  })
};

module.exports = Organization;