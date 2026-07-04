const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');
const Pedido = require('./Pedido');
const HistoricoPedido = require('./HistoricoPedido');

const RegistoHistoricoPedido = sequelize.define('RegistoHistoricoPedido', {
    ID_PEDIDO: { type: DataTypes.INTEGER, primaryKey: true },
    ID_HISTORICO: { type: DataTypes.INTEGER, primaryKey: true }
}, { tableName: 'REGISTO_HISTORICO_PEDIDO', timestamps: false });

// Associações N:M (Muitos para Muitos)
Pedido.belongsToMany(HistoricoPedido, { through: RegistoHistoricoPedido, foreignKey: 'ID_PEDIDO' });
HistoricoPedido.belongsToMany(Pedido, { through: RegistoHistoricoPedido, foreignKey: 'ID_HISTORICO' });

module.exports = RegistoHistoricoPedido;