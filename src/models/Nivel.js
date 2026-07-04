const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');
const Area = require('./Area');

const Nivel = sequelize.define('Nivel', {
    ID_NIVEL: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    ID_AREA: { type: DataTypes.INTEGER, allowNull: false },
    NOME_NIVEL: { type: DataTypes.STRING(50), allowNull: false },
    ORDEM_HIERARQUICA: { type: DataTypes.INTEGER, allowNull: false },
    DESCRICAO_NIVEL: { type: DataTypes.TEXT, allowNull: true }
}, {
    tableName: 'NIVEL',
    timestamps: false
});

Nivel.belongsTo(Area, { foreignKey: 'ID_AREA' });
Area.hasMany(Nivel, { foreignKey: 'ID_AREA' });

module.exports = Nivel;
