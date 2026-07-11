const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const MarcoConquista = sequelize.define('MarcoConquista', {
    ID_MARCO: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    TITULO_MARCO: { type: DataTypes.STRING(255), allowNull: false },
    DESCRICAO_MARCO: { type: DataTypes.TEXT, allowNull: true },
    PONTOS_EXTRA: { type: DataTypes.INTEGER, allowNull: false },
    REGRA_ATRIBUICAO: { type: DataTypes.TEXT, allowNull: true }, // passa a ser opcional ou calculada
    URL_IMAGEM_MARCO: { type: DataTypes.STRING(500), allowNull: false },
    TIPO_MARCO: { type: DataTypes.STRING(100), allowNull: true },
    PARAMETRO_1: { type: DataTypes.INTEGER, allowNull: true },
    PARAMETRO_2: { type: DataTypes.INTEGER, allowNull: true },
    DATA_CRIACAO_MARCO: { type: DataTypes.DATE, allowNull: true, defaultValue: DataTypes.NOW }
}, { tableName: 'MARCO_CONQUISTA', timestamps: false });

module.exports = MarcoConquista;
