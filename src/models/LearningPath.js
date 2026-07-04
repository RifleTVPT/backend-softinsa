const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const LearningPath = sequelize.define('LearningPath', {
    ID_LEARNING_PATH: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    ID_ADMIN: { type: DataTypes.INTEGER, allowNull: false },
    NOME_LEARNING_PATH: { type: DataTypes.STRING(255), allowNull: false },
    DESCRICAO_LEARNING_PATH: { type: DataTypes.TEXT, allowNull: true },
    DATA_CRIACAO_LEARNING_PATH: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    ESTADO_ATIVO_LEARNING_PATH: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true }
}, {
    tableName: 'LEARNING_PATH',
    timestamps: false
});

module.exports = LearningPath;
