const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');
const Pedido = require('./Pedido');
const Requisito = require('./Requisito');

const Evidencia = sequelize.define('Evidencia', {
    ID_EVIDENCIA: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    ID_PEDIDO: { 
        type: DataTypes.INTEGER, 
        allowNull: false,
        references: { model: Pedido, key: 'ID_PEDIDO' }
    },
    ID_REQUISITO: { 
        type: DataTypes.INTEGER, 
        allowNull: true,
        references: { model: Requisito, key: 'ID_REQUISITO' }
    },
    NOME_FICHEIRO: { type: DataTypes.STRING(255), allowNull: false },
    REQUISITO_MAPEADO: { type: DataTypes.STRING(50), allowNull: true },
    URL_FICHEIRO: { type: DataTypes.STRING(500), allowNull: false }
}, { tableName: 'EVIDENCIA', timestamps: false });

// As 3 associações vitais
Evidencia.belongsTo(Pedido, { foreignKey: 'ID_PEDIDO' });
Evidencia.belongsTo(Requisito, { foreignKey: 'ID_REQUISITO' });

// Associação inversa (A que lhe faltava!)
Pedido.hasMany(Evidencia, { foreignKey: 'ID_PEDIDO' });

module.exports = Evidencia;