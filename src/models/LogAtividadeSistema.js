const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');
const Utilizador = require('./Utilizador');

const LogAtividadeSistema = sequelize.define('LogAtividadeSistema', {
    ID_LOG_ATIVIDADE: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    ID_UTILIZADOR: { type: DataTypes.INTEGER, allowNull: false },
    TIPO_ATIVIDADE: { type: DataTypes.STRING(100), allowNull: false },
    DETALHES_ATIVIDADE: { type: DataTypes.TEXT, allowNull: false },
    DATA_HORA_ATIVIDADE: { type: DataTypes.DATE, allowNull: false }
}, {
    tableName: 'LOG_ATIVIDADE_SISTEMA',
    timestamps: false
});

// Associações
LogAtividadeSistema.belongsTo(Utilizador, { foreignKey: 'ID_UTILIZADOR' });
Utilizador.hasMany(LogAtividadeSistema, { foreignKey: 'ID_UTILIZADOR' });

module.exports = LogAtividadeSistema;