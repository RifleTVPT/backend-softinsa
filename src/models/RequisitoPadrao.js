const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');
const Nivel = require('./Nivel');

const RequisitoPadrao = sequelize.define('RequisitoPadrao', {
    ID_REQUISITO_PADRAO: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    ID_NIVEL: { type: DataTypes.INTEGER, allowNull: false },
    TITULO_PADRAO: { type: DataTypes.STRING(255), allowNull: false },
    DESCRICAO_PADRAO: { type: DataTypes.TEXT, allowNull: false },
    TIPO_REQUISITO_PADRAO: { type: DataTypes.STRING(50), allowNull: false },
    CODIGO_REFERENCIA: { type: DataTypes.STRING(50), allowNull: false }
}, {
    tableName: 'REQUISITO_PADRAO',
    timestamps: false
});

RequisitoPadrao.belongsTo(Nivel, { foreignKey: 'ID_NIVEL' });
Nivel.hasMany(RequisitoPadrao, { foreignKey: 'ID_NIVEL' });

module.exports = RequisitoPadrao;
