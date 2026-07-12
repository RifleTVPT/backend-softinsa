const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const sequelize = require('./config/database'); 
const userRoutes = require('./routes/userRoutes');
const dashboardConsultorRoutes = require('./routes/dashboardConsultorRoutes');
const catalogoRoutes = require('./routes/catalogoRoutes');
const meusBadgesRoutes = require('./routes/meusBadgesRoutes');
const conquistaRoutes = require('./routes/conquistaRoutes');
const pedidosRoutes = require('./routes/pedidosRoutes');
const estatisticasRoutes = require('./routes/estatisticasRoutes');
const objetivosRoutes = require('./routes/objetivosRoutes');
const relatoriosRoutes = require('./routes/relatoriosRoutes');
const notificacaoRoutes = require('./routes/notificacaoRoutes');
const dashboardTMRoutes = require('./routes/dashboardTMRoutes');
const expiracaoRoutes = require('./routes/expiracaoRoutes');
const consultoresTMRoutes = require('./routes/consultoresTMRoutes');
const dashboardSLLRoutes = require('./routes/dashboardSLLRoutes');
const sllBadgesRoutes = require('./routes/sllBadgesRoutes');
const consultoresSLLRoutes = require('./routes/consultoresSLLRoutes');
const dashboardAdminRoutes = require('./routes/dashboardAdminRoutes');
const adminUsersRoutes = require('./routes/adminUsersRoutes');
const estruturaRoutes = require('./routes/estruturaRoutes');
const configuracoesRoutes = require('./routes/configuracoesRoutes');
const avisoRoutes = require('./routes/avisoRoutes');
const adminConquistasRoutes = require('./routes/adminConquistasRoutes');
const mobileRoutes = require('./routes/mobileRoutes');
const meusBadgesController = require('./controllers/meusBadgesController');
const pedidosController = require('./controllers/pedidosController');
const startCronJobs = require('./cron/expiracaoCron');
const seedDatabase = require('./seed');

const app = express();

const Utilizador = require('./models/Utilizador');
const Pedido = require('./models/Pedido');
const Requisito = require('./models/Requisito');
const Evidencia = require('./models/Evidencia');
const HistoricoPedido = require('./models/HistoricoPedido');
const RegistoHistoricoPedido = require('./models/RegistoHistoricoPedido');
const HistoricoPontuacao = require('./models/HistoricoPontuacao');
const ObjetivoTimeline = require('./models/ObjetivoTimeline');
const LogExportacao = require('./models/LogExportacao');
const Administrador = require('./models/Administrador');
const TalentManager = require('./models/TalentManager');
const ServiceLineLeader = require('./models/ServiceLineLeader');
const LogAtividadeSistema = require('./models/LogAtividadeSistema');
const ConfiguracoesSistema = require('./models/ConfiguracoesSistema');

app.set('port', process.env.PORT || 3000);

app.use(cors());
app.use(express.json({ limit: '25mb' }));
app.use(express.urlencoded({ extended: true, limit: '25mb' }));

// Logger simples para ver as chamadas no terminal
app.use((req, res, next) => {
    console.log(`[API] ${req.method} ${req.url}`);
    next();
});

const middleware = require('./middlewares/middleware');

// middlewares
app.use('/users', userRoutes);

// Endpoints usados pelos links públicos. Têm de ficar antes do middleware JWT para funcionarem sem autenticação
app.get('/meus-badges/verificacao/:linkUnico', meusBadgesController.getVerificacaoPublica);
app.get('/meus-badges/verificacao-especial/:idUtilizador/:idMarco', meusBadgesController.getVerificacaoEspecialPublica);
app.get('/meus-badges/galeria/:idUtilizador', meusBadgesController.getGaleriaPublica);
app.get('/partilha/linkedin/badge/:linkUnico', meusBadgesController.getPartilhaLinkedInBadge);
app.get('/partilha/linkedin/premium/:idUtilizador/:idMarco', meusBadgesController.getPartilhaLinkedInEspecial);
app.get('/partilha/linkedin/galeria/:idUtilizador', meusBadgesController.getPartilhaLinkedInGaleria);
app.get('/ficheiros/evidencias/:idEvidencia/:nomeFicheiro?', pedidosController.servirFicheiroEvidencia);

app.use('/dashboard/consultor', middleware.checkToken, dashboardConsultorRoutes);
app.use('/catalogo', middleware.checkToken, catalogoRoutes);
app.use('/meus-badges', middleware.checkToken, meusBadgesRoutes);
app.use('/conquistas', middleware.checkToken, conquistaRoutes);
app.use('/admin-conquistas', middleware.checkToken, adminConquistasRoutes);
app.use('/pedidos', middleware.checkToken, pedidosRoutes);
app.use('/estatisticas', middleware.checkToken, estatisticasRoutes);
app.use('/objetivos', middleware.checkToken, objetivosRoutes);
app.use('/relatorios', middleware.checkToken, relatoriosRoutes);
app.use('/notificacoes', middleware.checkToken, notificacaoRoutes);
app.use('/dashboard/talent-manager', middleware.checkToken, dashboardTMRoutes);
app.use('/expiracao', middleware.checkToken, expiracaoRoutes);
app.use('/talent/consultores', middleware.checkToken, consultoresTMRoutes);
app.use('/dashboard/sll', middleware.checkToken, dashboardSLLRoutes);
app.use('/sll-badges', middleware.checkToken, sllBadgesRoutes);
app.use('/sll-consultores', middleware.checkToken, consultoresSLLRoutes);
app.use('/dashboard/admin', middleware.checkToken, dashboardAdminRoutes);
app.use('/admin-users', middleware.checkToken, adminUsersRoutes);
app.use('/estrutura', estruturaRoutes);
app.use('/configuracoes', configuracoesRoutes);
app.use('/avisos', middleware.checkToken, avisoRoutes);
app.use('/mobile', middleware.checkToken, mobileRoutes);

app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// Mostrar ficheiros estáticos do frontend, se alguém aceder ao site o Express vai enviar os ficheiros do React para o browser do utilizador
app.use(express.static(path.join(__dirname, '../../frontend-web/dist')));

// Mostrar o index.html em rotas que não são conhecidas no backend, por exemplo com refresh da página
app.get('*', (req, res, next) => {
    // Evitar servir index.html para rotas de API conhecidas ou uploads
    const apiPrefixes = [
        '/users', '/dashboard', '/catalogo', '/meus-badges', '/conquistas',
        '/admin-conquistas', '/pedidos', '/estatisticas', '/objetivos',
        '/relatorios', '/notificacoes', '/expiracao', '/talent',
        '/sll-badges', '/sll-consultores', '/admin-users', '/estrutura',
    ];
    if (apiPrefixes.some(prefix => req.path.startsWith(prefix))) { //para distinguir o que é um pedido de página visual de um pedido de dados para a API
        return next();
    }
    
    const indexPath = path.join(__dirname, '../../frontend-web/dist/index.html');
    if (fs.existsSync(indexPath)) {
        res.sendFile(indexPath);
    } else {
        res.status(200).send("Bem-vindo à API Softinsa. O Frontend ainda não foi buildado neste ambiente.");
    }
});

// Sincronização e arranque do servidor
const isSqlite = sequelize.getDialect() === 'sqlite';

sequelize.sync({ force: isSqlite, alter: !isSqlite })
    .then(async () => {
        console.log('Tabelas sincronizadas');
        
        if (isSqlite) {
            console.log('[Database] SQLite ativo. A injetar dados iniciais automaticamente...');
            try {
                await seedDatabase();
            } catch (seedErr) {
                console.error('Erro ao semear a base de dados SQLite:', seedErr);
            }
        }

        // Iniciar as Tarefas Agendadas (Cron) como por exemplo verificar se há algum badge em expiração quando passa a meia noite
        startCronJobs();

        app.listen(app.get('port'), () => {
            console.log("Servidor a correr na porta " + app.get('port'));
        });
    })
    .catch(err => {
        console.log('Erro na BD: ', err);
    });
