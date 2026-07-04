const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const ServiceLineLeader = sequelize.define('ServiceLineLeader', {
    ID_SLL: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    ID_UTILIZADOR: { type: DataTypes.INTEGER, allowNull: true },
    CARGO_SLL: { type: DataTypes.STRING(100), allowNull: false },
    DATA_INICIO_FUNCOES: { type: DataTypes.DATE, allowNull: true },
    DATA_FIM_FUNCOES: { type: DataTypes.DATE, allowNull: true }
}, {
    tableName: 'SERVICE_LINE_LEADER',
    timestamps: false
});

module.exports = ServiceLineLeader;