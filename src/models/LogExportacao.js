const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');
const Utilizador = require('./Utilizador');

const LogExportacao = sequelize.define('LogExportacao', {
    ID_EXPORT: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    ID_UTILIZADOR: { type: DataTypes.INTEGER, allowNull: false },
    TIPO_FICHEIRO: { type: DataTypes.STRING(10), allowNull: false }, // 'PDF' ou 'EXCEL'
    DATA_GERACAO: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
    FILTROS_APLICADOS: { type: DataTypes.TEXT, allowNull: true }
}, { tableName: 'LOG_EXPORTACAO', timestamps: false });

LogExportacao.belongsTo(Utilizador, { foreignKey: 'ID_UTILIZADOR' });

module.exports = LogExportacao;