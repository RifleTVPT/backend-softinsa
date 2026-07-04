const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');
const Utilizador = require('./Utilizador');

const HistoricoPedido = sequelize.define('HistoricoPedido', {
    ID_HISTORICO: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    ID_UTILIZADOR: { type: DataTypes.INTEGER, allowNull: false },
    DATA_REGISTO_PEDIDO: { type: DataTypes.DATE, allowNull: false },
    ESTADO_ATUAL_PEDIDO: { type: DataTypes.STRING(50), allowNull: false },
    TIPO_ACAO: { type: DataTypes.STRING(100), allowNull: false },
    COMENTARIO_VALIDADOR: { type: DataTypes.TEXT, allowNull: true },
    PERFIL_DECISOR: { type: DataTypes.STRING(50), allowNull: false },
    STATUS_RESULTADO: { type: DataTypes.STRING(50), allowNull: false } // 'success', 'pending', 'danger'
}, { tableName: 'HISTORICO_PEDIDO', timestamps: false });

HistoricoPedido.belongsTo(Utilizador, { foreignKey: 'ID_UTILIZADOR' });

module.exports = HistoricoPedido;