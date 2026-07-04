const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');
const Consultor = require('./Consultor');
const Badge = require('./Badge');

const ConsultorBadge = sequelize.define('ConsultorBadge', {
    ID_CONSULTOR: { type: DataTypes.INTEGER, primaryKey: true },
    ID_BADGE: { type: DataTypes.INTEGER, primaryKey: true },
    DATA_ATRIBUICAO_BADGE: { type: DataTypes.DATE, allowNull: false },
    MOTIVO_ATRIBUICAO: { type: DataTypes.TEXT, allowNull: true },
    DATA_EXPIRACAO: { type: DataTypes.DATE, allowNull: true },
    LINK_UNICO_BADGE: { type: DataTypes.STRING(500), allowNull: false },
    STATUS_GALERIA_PUBLICA: { type: DataTypes.BOOLEAN, defaultValue: true }
}, { 
    tableName: 'CONSULTOR_BADGE', 
    timestamps: false 
});

ConsultorBadge.belongsTo(Consultor, { foreignKey: 'ID_CONSULTOR' });
Consultor.hasMany(ConsultorBadge, { foreignKey: 'ID_CONSULTOR' });

ConsultorBadge.belongsTo(Badge, { foreignKey: 'ID_BADGE' });
Badge.hasMany(ConsultorBadge, { foreignKey: 'ID_BADGE' });

module.exports = ConsultorBadge;