const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');
const Utilizador = require('./Utilizador');

const Consultor = sequelize.define('Consultor', {
    ID_CONSULTOR: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    ID_UTILIZADOR: { 
        type: DataTypes.INTEGER, 
        allowNull: false,
        references: { model: Utilizador, key: 'ID_UTILIZADOR' } 
    },
    DATA_ENTRADA_EMPRESA: { type: DataTypes.DATE, allowNull: false },
    PONTUACAO_TOTAL: { type: DataTypes.INTEGER, defaultValue: 0 },
    ID_AREA: { type: DataTypes.INTEGER, allowNull: true }
}, { 
    tableName: 'CONSULTOR', 
    timestamps: false 
});

Consultor.belongsTo(Utilizador, { foreignKey: 'ID_UTILIZADOR' });

module.exports = Consultor;