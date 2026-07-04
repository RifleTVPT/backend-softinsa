const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');
const ServiceLine = require('./ServiceLine');

const Area = sequelize.define('Area', {
    ID_AREA: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    ID_UTILIZADOR: { type: DataTypes.INTEGER, allowNull: false },
    ID_SERVICE_LINE: { type: DataTypes.INTEGER, allowNull: false },
    NOME_AREA: { type: DataTypes.STRING(255), allowNull: false },
    DESCRICAO_AREA: { type: DataTypes.TEXT, allowNull: true }
}, {
    tableName: 'AREA',
    timestamps: false
});

Area.belongsTo(ServiceLine, { foreignKey: 'ID_SERVICE_LINE' });
ServiceLine.hasMany(Area, { foreignKey: 'ID_SERVICE_LINE' });

module.exports = Area;
