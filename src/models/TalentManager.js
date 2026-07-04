const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const TalentManager = sequelize.define('TalentManager', {
    ID_TM: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    ID_UTILIZADOR: { type: DataTypes.INTEGER, allowNull: true },
    DATA_INICIO_FUNC: { type: DataTypes.DATE, allowNull: true },
    DATA_FIM_FUNC: { type: DataTypes.DATE, allowNull: true }
}, {
    tableName: 'TALENT_MANAGER',
    timestamps: false
});

module.exports = TalentManager;