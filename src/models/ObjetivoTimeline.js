const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');
const Utilizador = require('./Utilizador'); // Importar para a associação correta

const ObjetivoTimeline = sequelize.define('ObjetivoTimeline', {
    ID_OBJETIVO: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    ID_UTILIZADOR: { type: DataTypes.INTEGER, allowNull: false }, // Faltava esta coluna!
    TITULO: { type: DataTypes.STRING(255), allowNull: false },
    DESCRICAO: { type: DataTypes.TEXT, allowNull: true },
    DATA_OBJETIVO: { type: DataTypes.DATE, allowNull: false },
    STATUS: { type: DataTypes.STRING(50), allowNull: false }, // 'Em Progresso', 'Concluído'
    DATA_CONCLUSAO: { type: DataTypes.DATE, allowNull: true },
    ORIGEM: { type: DataTypes.STRING(100), allowNull: false } // Ex: 'Criado por mim' ou 'Service Line Leader'
}, { tableName: 'OBJETIVO_TIMELINE', timestamps: false });

ObjetivoTimeline.belongsTo(Utilizador, { foreignKey: 'ID_UTILIZADOR' });

module.exports = ObjetivoTimeline;