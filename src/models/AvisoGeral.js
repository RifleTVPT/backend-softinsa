const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const AvisoGeral = sequelize.define('AvisoGeral', {
    ID_AVISO: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    TITULO_AVISO: { type: DataTypes.STRING(255), allowNull: false },
    CONTEUDO_AVISO: { type: DataTypes.TEXT, allowNull: false },
    DATA_PUBLICACAO_AVISO: { type: DataTypes.DATE, allowNull: false },
    TIPO_NOTIFICACAO: { type: DataTypes.STRING(50), allowNull: false },
    ESTADO_AVISO: { type: DataTypes.STRING(20), defaultValue: 'Ativo' },
    VISIBILIDADE_AVISO: { type: DataTypes.STRING(50), defaultValue: 'Todos' }
}, { tableName: 'AVISO_GERAL', timestamps: false });

module.exports = AvisoGeral;