require('dotenv').config();

module.exports = {
  jwtSecret: process.env.JWT_SECRET || 'a-minha-chave-secreta-que-ninguem-descobre'
};
