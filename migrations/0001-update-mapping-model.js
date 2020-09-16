module.exports = {
  up: (queryInterface, Sequelize) => {
    return queryInterface.addColumn(
      'mappings',
      'integrationDataType',
      {
        "type": Sequelize.STRING,
      }
    );
  }
};