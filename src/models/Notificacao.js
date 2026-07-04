const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Notificacao = sequelize.define('Notificacao', {
    ID_NOTIFICACAO: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    ID_UTILIZADOR: { type: DataTypes.INTEGER, allowNull: false },
    TITULO_NOTIFICACAO: { type: DataTypes.STRING(255), allowNull: false },
    MENSAGEM_NOTIFICACAO: { type: DataTypes.TEXT, allowNull: false },
    DATA_ENVIO_NOTIFICACAO: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
    ESTADO_LIDO: { type: DataTypes.BOOLEAN, defaultValue: false },
    TIPO_NOTIFICACAO: { type: DataTypes.STRING(50), defaultValue: 'system' }
}, { tableName: 'NOTIFICACAO', timestamps: false });

module.exports = Notificacao;