const sequelize = require('./config/database');

async function resetDatabase() {
  if (!process.argv.includes('--confirm')) {
    console.error('Reset bloqueado. Execute com --confirm para confirmar que quer apagar a base de dados.');
    process.exit(1);
  }

  const dialect = sequelize.getDialect();
  if (dialect !== 'postgres') {
    console.error(`Reset bloqueado. Este script foi feito para PostgreSQL, mas a ligação atual é ${dialect}.`);
    process.exit(1);
  }

  console.log('[Reset DB] A ligar à base de dados...');
  await sequelize.authenticate();

  console.log('[Reset DB] A apagar schema public e todos os dados...');
  await sequelize.query('DROP SCHEMA IF EXISTS public CASCADE;');

  console.log('[Reset DB] A recriar schema public...');
  await sequelize.query('CREATE SCHEMA public;');
  await sequelize.query('GRANT ALL ON SCHEMA public TO public;');
  await sequelize.query('GRANT ALL ON SCHEMA public TO CURRENT_USER;');

  console.log('[Reset DB] Base de dados limpa com sucesso.');
  await sequelize.close();
}

resetDatabase().catch(async error => {
  console.error('[Reset DB] Erro ao limpar a base de dados:', error);
  try {
    await sequelize.close();
  } catch (_) {}
  process.exit(1);
});
