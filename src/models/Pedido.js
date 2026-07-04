const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

// 1. Importar os modelos que vão servir de Chave Estrangeira
const Utilizador = require('./Utilizador');
const Badge = require('./Badge');

const Pedido = sequelize.define('Pedido', {
    ID_PEDIDO: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    ID_UTILIZADOR: {
        type: DataTypes.INTEGER,
        allowNull: false,
        // 2. Definir a Foreign Key
        references: {
            model: Utilizador,
            key: 'ID_UTILIZADOR'
        }
    },
    ID_TM: {
        type: DataTypes.INTEGER,
        allowNull: true
    },
    ID_SLL: {
        type: DataTypes.INTEGER,
        allowNull: true
    },
    ID_BADGE: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: {
            model: Badge,
            key: 'ID_BADGE'
        }
    },
    DATA_SUBMISSAO_PEDIDO: {
        type: DataTypes.DATE,
        allowNull: false
    },
    ESTADO_PEDIDO: {
        type: DataTypes.STRING(50),
        allowNull: false
    },
    COMENTARIO_CONSULTOR: {
        type: DataTypes.TEXT,
        allowNull: true
    },
    DATA_ULTIMA_ATUALIZACAO: {
        type: DataTypes.DATE,
        allowNull: false
    }
}, {
    tableName: 'PEDIDO',
    timestamps: false
});

// 3. Declarar a associação no fim
Pedido.belongsTo(Utilizador, { foreignKey: 'ID_UTILIZADOR' });
Pedido.belongsTo(Badge, { foreignKey: 'ID_BADGE' });

module.exports = Pedido;