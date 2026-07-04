const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');
const Utilizador = require('./Utilizador');

const HistoricoPontuacao = sequelize.define('HistoricoPontuacao', {
    ID_HISTORICO_PONTOS: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    ID_UTILIZADOR: { type: DataTypes.INTEGER, allowNull: false },
    DATA_ATRIBUICAO: { type: DataTypes.DATE, allowNull: false },
    PONTOS_OBTIDOS: { type: DataTypes.INTEGER, allowNull: false },
    ORIGEM_PONTOS: { type: DataTypes.STRING(255), allowNull: true }
}, { tableName: 'HISTORICO_PONTUACAO', timestamps: false });

HistoricoPontuacao.belongsTo(Utilizador, { foreignKey: 'ID_UTILIZADOR' });

module.exports = HistoricoPontuacao;