const { Sequelize } = require('sequelize');
require('dotenv').config();

// Ligao direta  Base de Dados do Render
const sequelize = new Sequelize(
  'softinsa_db_80qb', 
  'softinsa_db_80qb_user',
  '8TEBjF90KAOZIcwpjDyZb1kADKmCw5lA',
  {
    host: 'dpg-d947aoq8qa3s73c1a5n0-a.oregon-postgres.render.com',
    dialect: 'postgres',
    port: 5432,
    logging: false,
    dialectOptions: {
      ssl: {
        require: true,
        rejectUnauthorized: false // Necessrio para o Render
      }
    }
  }
);

module.exports = sequelize;