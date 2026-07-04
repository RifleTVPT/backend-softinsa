const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');
const Badge = require('./Badge');

const Requisito = sequelize.define('Requisito', {
    ID_REQUISITO: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    ID_BADGE: { 
        type: DataTypes.INTEGER, 
        allowNull: false,
        references: { model: Badge, key: 'ID_BADGE' }
    },
    ID_REQUISITO_PADRAO: { type: DataTypes.INTEGER, allowNull: true },
    TITULO_REQUISITO: { type: DataTypes.STRING(255), allowNull: false },
    DESCRICAO_REQUISITO: { type: DataTypes.TEXT, allowNull: false },
    TIPO_REQUISITO: { type: DataTypes.STRING(50), allowNull: false },
    ORDEM_REQUISITO: { type: DataTypes.INTEGER, allowNull: true }
}, { tableName: 'REQUISITO', timestamps: false });

Requisito.belongsTo(Badge, { foreignKey: 'ID_BADGE' });
Badge.hasMany(Requisito, { foreignKey: 'ID_BADGE', as: 'requisitos' }); // Associação inversa para facilitar a listagem

module.exports = Requisito;