const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');
const Utilizador = require('./Utilizador');

const PreferenciasUtilizador = sequelize.define('PreferenciasUtilizador', {
    ID_PREFERENCIA: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    ID_UTILIZADOR: { type: DataTypes.INTEGER, allowNull: false },
    IDIOMA_APP: { type: DataTypes.STRING(10), allowNull: false },
    RECEBER_EMAIL_PEDIDOS: { type: DataTypes.BOOLEAN, allowNull: false },
    RECEBER_PUSH_EXPIRACAO: { type: DataTypes.BOOLEAN, allowNull: false },
    EXIBIR_LINK_PUBLICO: { type: DataTypes.BOOLEAN, allowNull: false },
    TERMOS_RGPD: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false }
}, { tableName: 'PREFERENCIAS_UTILIZADOR', timestamps: false });

PreferenciasUtilizador.belongsTo(Utilizador, { foreignKey: 'ID_UTILIZADOR' });

module.exports = PreferenciasUtilizador;