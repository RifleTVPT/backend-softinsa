const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const ServiceLineLearningPath = sequelize.define('ServiceLineLearningPath', {
    ID_LEARNING_PATH: { type: DataTypes.INTEGER, primaryKey: true },
    ID_SERVICE_LINE: { type: DataTypes.INTEGER, primaryKey: true }
}, {
    tableName: 'SERVICELINE_LEARNINGPATH',
    timestamps: false
});

module.exports = ServiceLineLearningPath;
