const axios = require('axios');
const keys = require('./../keys');
const crowdin = require('@crowdin/crowdin-api-client').default;

const helper = require('./../helpers');
const decryptData = helper.decryptData;
const encryptData = helper.encryptData;
const catchRejection = helper.catchRejection;

module.exports = function(sequelize, DataTypes) {
  const Organization = sequelize.define('organization', {
    uid: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true,
    },
    accessToken: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    refreshToken: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    expire: {
      type: DataTypes.STRING,
      allowNull: false,
    }
  });

  Organization.getProjectData = () => (req, res) => {
    const crowdinApi = res.crowdinApiClient;
    const projectId = res.origin.context.project_id;
    let languagesById = {};
    crowdinApi.languagesApi.listSupportedLanguages(500, 0)
      .then(languages => {
        languagesById = languages.data.reduce( (acc, l) => ({...acc, [l.data.id]: l.data}), {});
        return crowdinApi.projectsGroupsApi.getProject(projectId);
      })
      .then( project => {
        let projectTargetLanguages = project.data.targetLanguageIds.map(lId => languagesById[lId]);
        res.json({...project.data, projectTargetLanguages});
      })
      .catch(catchRejection('Cant fetch file progress', res));
  };

  Organization.getFileProgress = () => (req, res) => {
    const crowdinApi = res.crowdinApiClient;
    const projectId = res.origin.context.project_id;
    crowdinApi.translationStatusApi.getFileProgress(projectId, req.body.fileId)
      .then( progress => res.json({[`${req.body.fileId}`]: progress.data.map(({data}) => ({...data}))}))
      .catch(catchRejection('Cant fetch file progress', res));
  };

  Organization.getProjectFiles = (db) => (req, res) => {
    const crowdinApi = res.crowdinApiClient;
    let files = [];
    const projectId = res.origin.context.project_id;

    db.mapping.findAll({where: { projectId: projectId, domain: res.origin.domain } })
      .then(uploadedFiles => {
        if(!uploadedFiles || !uploadedFiles.length){
          res.json([]);
        }
        return Promise.all(uploadedFiles.map(f => crowdinApi.sourceFilesApi.getFile(projectId, f.crowdinFileId).catch(e => ({}))))
      })
      .then(filesRes => {
        files = filesRes.filter(fr => !!fr.data).map(({data}) => data).map(({directoryId, branchId, name, title, ...rest}) => ({
          ...rest,
          name: title || name,
          title: title ? name : undefined,
          node_type: '1',
          parent_id: '0' //directoryId || branchId || 0
        }));
        res.json(files);
      })
      .catch(catchRejection('Cant fetch data from Crowdin', res));

    // Promise.all([
    //   crowdinApi.sourceFilesApi.listProjectDirectories(projectId, undefined, undefined, 500),
    //   crowdinApi.sourceFilesApi.listProjectFiles(projectId, undefined, undefined, 500),
    //   crowdinApi.sourceFilesApi.listProjectBranches(projectId, undefined, 500)
    // ])
    //   .then(responses => {
    //     files.push(...responses[0].data.map(({data}) => ({...data, node_type: '0'})));
    //     files.push(...responses[1].data.map(({data}) => data));
    //     files.push(...responses[2].data.map(({data}) => ({...data, node_type: '2'})));
    //     res.json(files.map(({directoryId, branchId, ...rest}) => ({
    //       ...rest,
    //       parent_id: directoryId || branchId || 0
    //     })));
    //   })
    //   .catch(catchRejection('Cant fetch data from Crowdin', res));
  };

  Organization.install = () => (req, res) => {
    let client = null;
    Organization.findOne({where: {uid: req.body.domain}})
      .then(organization => {
        client = organization;
        let payload = {
          grant_type: 'authorization_code',
          client_id: keys.crowdinClientId,
          client_secret: keys.crowdinClientSecret,
          code: req.body.code,
        };
        // todo: do not forget change this line before production!!!
        return axios.post(keys.crowdinAuthUrl, payload)
      })
      .then(resp => {
        const params = {
          uid: req.body.domain,
          refreshToken: encryptData(resp.data.refresh_token),
          accessToken: encryptData(resp.data.access_token),
          expire: new Date().getTime()/1000 + +resp.data.expires_in
        };
        if(!!client){
          return client.update(params);
        } else {
          return Organization.create(params);
        }
      })
      .then(organization => {
        if(!!organization){
          res.status(204).send();
        } else {
          catchRejection('Cant update/create organization', res)();
        }
      })
      .catch(catchRejection('Cant install application', res));
  };

  Organization.getOrganization = (res) => {
    return new Promise ( (resolve, reject) => {
      Organization.findOne({where: {uid: res.origin.domain}})
        .then((organization) => {
          if(!organization) {
            return reject('Can\'t find organization by id');
          }
          const isExpired = +organization.expire < +new Date().getTime() / 1000;
          if(!isExpired) {
            res.crowdinApiClient = new crowdin({
              token: decryptData(organization.accessToken),
              organization: organization.uid,
            });
            resolve();
          } else {
            let payload = {
              grant_type: 'refresh_token',
              client_id: keys.crowdinClientId,
              client_secret: keys.crowdinClientSecret,
              refresh_token: decryptData(organization.refreshToken),
            };
            axios.post(keys.crowdinAuthUrl, payload)
              .then(response => {
                let params = {
                  refreshToken: encryptData(response.data.refresh_token),
                  accessToken: encryptData(response.data.access_token),
                  expire: (new Date().getTime() / 1000) + response.data.expires_in
                };
                return organization.update(params)
              })
              .then(organization => {
                res.crowdinApiClient = new crowdin({
                  token: decryptData(organization.accessToken),
                  organization: organization.uid,
                });
                resolve()
              })
              .catch(e => reject('Can\'t renew access token', e));
          }
        })
        .catch(e => reject('Can\'t find organization by id', e))
    });
  };

  return Organization;
};