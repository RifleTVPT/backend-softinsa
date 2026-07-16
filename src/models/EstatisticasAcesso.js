const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');
const ServiceLine = require('./ServiceLine');

const EstatisticasAcesso = sequelize.define('EstatisticasAcesso', {
    ID_ESTATISTICA: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    ID_SERVICE_LINE: { type: DataTypes.INTEGER, allowNull: true },
    DATA_REFERENCIA: { type: DataTypes.DATE, allowNull: false },
    TOTAL_ACESSOS_DIA: { type: DataTypes.INTEGER, allowNull: false }
}, {
    tableName: 'ESTATISTICAS_ACESSO',
    timestamps: false
});

EstatisticasAcesso.belongsTo(ServiceLine, { foreignKey: 'ID_SERVICE_LINE', constraints: false });

module.exports = EstatisticasAcesso;
