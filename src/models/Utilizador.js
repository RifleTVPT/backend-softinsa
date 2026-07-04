const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Utilizador = sequelize.define('Utilizador', {
    ID_UTILIZADOR: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    ID_ADMIN: { type: DataTypes.INTEGER, allowNull: true },
    ID_OBJETIVO: { type: DataTypes.INTEGER, allowNull: true },
    NOME_COMPLETO_UTILIZADOR: { type: DataTypes.STRING(255), allowNull: false },
    EMAIL_UTILIZADOR: { type: DataTypes.STRING(255), allowNull: false, unique: true },
    
    // VALORES POR DEFEITO ADICIONADOS PARA NÃO VOLTAR A CRASHAR!
    ESTADO_CONTA_UTILIZADOR: { type: DataTypes.STRING(50), allowNull: false, defaultValue: 'Ativo' },
    DATA_REGISTO_UTILIZADOR: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    IS_PRIMEIRO_ACESSO: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    
    PERFIL_UTILIZADOR: { type: DataTypes.STRING(50), allowNull: false },
    PASSWORD_UTILIZADOR: { type: DataTypes.STRING(255), allowNull: false },
    
    // Coluna da Foto adicionada no passo anterior
    URL_FOTO: { type: DataTypes.STRING(500), allowNull: true },
    
    // Motivação de registo pedida pelo user
    MOTIVACAO_REGISTO: { type: DataTypes.TEXT, allowNull: true },
    SL_REGISTO: { type: DataTypes.STRING(255), allowNull: true },
    AREA_REGISTO: { type: DataTypes.STRING(255), allowNull: true },
    FCM_TOKEN: { type: DataTypes.STRING(500), allowNull: true }

}, { 
    tableName: 'UTILIZADOR', 
    timestamps: false,
    hooks: {
        beforeCreate: async (user, options) => {
            if (user.PASSWORD_UTILIZADOR) {
                const bcrypt = require('bcryptjs');
                const hash = await bcrypt.hash(user.PASSWORD_UTILIZADOR, 10);
                user.PASSWORD_UTILIZADOR = hash;
            }
        },
        beforeUpdate: async (user, options) => {
            if (user.changed('PASSWORD_UTILIZADOR')) {
                const bcrypt = require('bcryptjs');
                const hash = await bcrypt.hash(user.PASSWORD_UTILIZADOR, 10);
                user.PASSWORD_UTILIZADOR = hash;
            }
        }
    }
});

module.exports = Utilizador;