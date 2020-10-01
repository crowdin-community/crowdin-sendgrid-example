module.exports = {
  up: (queryInterface, Sequelize) => {
    return queryInterface.addColumn(
      'Integrations',
      'metadataFileId',
      {
        "type": Sequelize.STRING,
      }
    );
  }
};