const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');
const MarcoConquista = require('./MarcoConquista');
const Consultor = require('./Consultor');

const MarcoConsultor = sequelize.define('MarcoConsultor', {
    ID_CONSULTOR: { type: DataTypes.INTEGER, primaryKey: true },
    ID_MARCO: { type: DataTypes.INTEGER, primaryKey: true },
    DATA_CONQUISTA: { type: DataTypes.DATE, defaultValue: DataTypes.NOW } // Campo extra para saber quando ganhou
}, { tableName: 'MARCO_CONSULTOR', timestamps: false });

MarcoConsultor.belongsTo(MarcoConquista, {
    foreignKey: 'ID_MARCO',
    as: 'MarcoConquista'
});
MarcoConquista.hasMany(MarcoConsultor, {
    foreignKey: 'ID_MARCO',
    as: 'Consultores'
});
MarcoConsultor.belongsTo(Consultor, {
    foreignKey: 'ID_CONSULTOR'
});
Consultor.hasMany(MarcoConsultor, {
    foreignKey: 'ID_CONSULTOR'
});

module.exports = MarcoConsultor;
