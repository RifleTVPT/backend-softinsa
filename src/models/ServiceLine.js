const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const ServiceLine = sequelize.define('ServiceLine', {
    ID_SERVICE_LINE: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    ID_ADMIN: { type: DataTypes.INTEGER, allowNull: false },
    ID_SLL: { type: DataTypes.INTEGER, allowNull: true },
    NOME_SERVICE_LINE: { type: DataTypes.STRING(255), allowNull: false },
    DESCRICAO_SERVICE_LINE: { type: DataTypes.TEXT, allowNull: true },
    ESTADO_ATIVO_SERVICE_LINE: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true }
}, {
    tableName: 'SERVICE_LINE',
    timestamps: false
});

module.exports = ServiceLine;
