const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const ConfiguracoesSistema = sequelize.define('ConfiguracoesSistema', {
    ID_CONFIG: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    MODO_MANUTENCAO: {
        type: DataTypes.BOOLEAN,
        defaultValue: false
    },
    PONTOS_DEFAULT_A: {
        type: DataTypes.INTEGER,
        defaultValue: 150
    },
    PONTOS_DEFAULT_B: {
        type: DataTypes.INTEGER,
        defaultValue: 200
    },
    PONTOS_DEFAULT_C: {
        type: DataTypes.INTEGER,
        defaultValue: 250
    },
    PONTOS_DEFAULT_D: {
        type: DataTypes.INTEGER,
        defaultValue: 350
    },
    PONTOS_DEFAULT_E: {
        type: DataTypes.INTEGER,
        defaultValue: 500
    },
    PONTOS_DEFAULT_OUTRO: {
        type: DataTypes.INTEGER,
        defaultValue: 750
    },
    VALIDADE_MESES_PADRAO: {
        type: DataTypes.INTEGER,
        defaultValue: 12
    },
    IDIOMA_PADRAO: {
        type: DataTypes.STRING(50),
        defaultValue: 'Português (Portugal)'
    },
    SESSAO_EXPIRACAO: {
        type: DataTypes.STRING(50),
        defaultValue: '4 Horas (Padrão)'
    },
    RETENCAO_EVIDENCIAS: {
        type: DataTypes.STRING(50),
        defaultValue: '5 Anos (Recomendado)'
    },
    GLOBAL_EMAIL: {
        type: DataTypes.BOOLEAN,
        defaultValue: true
    },
    GLOBAL_PUSH: {
        type: DataTypes.BOOLEAN,
        defaultValue: true
    },
    MATRIZ_NOTIFICACOES: {
        type: DataTypes.TEXT,
        allowNull: true
    },
    SMTP_HOST: {
        type: DataTypes.STRING(255),
        allowNull: true
    },
    SMTP_PORT: {
        type: DataTypes.INTEGER,
        allowNull: true
    },
    SMTP_USER: {
        type: DataTypes.STRING(255),
        allowNull: true
    },
    SMTP_PASS: {
        type: DataTypes.STRING(255),
        allowNull: true
    },
    SMTP_SECURE: {
        type: DataTypes.BOOLEAN,
        defaultValue: false
    },
    RGPD_TERMOS: {
        type: DataTypes.TEXT,
        allowNull: true
    },
    RGPD_POLITICAS: {
        type: DataTypes.TEXT,
        allowNull: true
    },
    RGPD_CONSENTIMENTOS: {
        type: DataTypes.TEXT,
        allowNull: true
    }
}, {
    tableName: 'CONFIGURACOES_SISTEMA',
    timestamps: true
});

module.exports = ConfiguracoesSistema;
