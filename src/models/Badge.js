const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Badge = sequelize.define('Badge', {
    ID_BADGE: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    ID_CATEGORIA: {
        type: DataTypes.INTEGER,
        allowNull: false
    },
    ID_NIVEL: {
        type: DataTypes.INTEGER,
        allowNull: false
    },
    ID_ADMIN: {
        type: DataTypes.INTEGER,
        allowNull: false
    },
    NOME_BADGE: {
        type: DataTypes.STRING(255),
        allowNull: false
    },
    DESCRICAO_BADGE: {
        type: DataTypes.TEXT, // varchar(MAX) no SQL
        allowNull: true
    },
    CATEGORIA_BADGE: {
        type: DataTypes.STRING(255),
        allowNull: false
    },
    PONTOS_BADGE: {
        type: DataTypes.INTEGER,
        allowNull: false
    },
    URL_IMAGEM: {
        type: DataTypes.STRING(500),
        allowNull: false
    },
    TEMPO_EXPIRACAO_BADGE: {
        type: DataTypes.INTEGER,
        allowNull: true
    },
    IS_PREMIUM: {
        type: DataTypes.BOOLEAN, // bit no SQL
        allowNull: false
    },
    VALIDADE_MESES: {
        type: DataTypes.INTEGER,
        allowNull: true
    },
    VALIDADE_EXPIRACAO: {
        type: DataTypes.DATE, // datetime no SQL
        allowNull: true
    }
}, {
    tableName: 'BADGE', // Nome exato igual ao seu script SQL
    timestamps: false
});

module.exports = Badge;const Nivel = require('./Nivel'); Badge.belongsTo(Nivel, { foreignKey: 'ID_NIVEL' }); Nivel.hasMany(Badge, { foreignKey: 'ID_NIVEL' });
