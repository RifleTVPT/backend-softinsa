const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Administrador = sequelize.define('Administrador', {
    ID_ADMIN: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    ID_UTILIZADOR: { type: DataTypes.INTEGER, allowNull: true },
    DATA_REGISTO_PLATAFORMA: { type: DataTypes.DATE, allowNull: true }
}, {
    tableName: 'ADMINISTRADOR',
    timestamps: false
});

module.exports = Administrador;