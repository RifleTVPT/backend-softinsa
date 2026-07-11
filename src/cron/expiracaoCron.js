const cron = require('node-cron');
const ConsultorBadge = require('../models/ConsultorBadge');
const Consultor = require('../models/Consultor');
const Utilizador = require('../models/Utilizador');
const Badge = require('../models/Badge');
const Notificacao = require('../models/Notificacao');
const PreferenciasUtilizador = require('../models/PreferenciasUtilizador');
const ObjetivoTimeline = require('../models/ObjetivoTimeline');
const mailer = require('../config/mailer');
const pushService = require('../services/pushService');
const { Op } = require('sequelize');

// Agendar tarefa para correr todos os dias à meia-noite (0 0 * * *)
const startCronJobs = () => {
    cron.schedule('0 0 * * *', async () => {
        console.log('[CRON] A iniciar verificação diária de badges em expiração...');
        
        try {
            const dataAtual = new Date();
            const dataAlvo30Dias = new Date();
            dataAlvo30Dias.setDate(dataAtual.getDate() + 30);
            
            const dataAlvo15Dias = new Date();
            dataAlvo15Dias.setDate(dataAtual.getDate() + 15);

            // Obter badges que expiram nos próximos 30 dias exatos, ou 15 dias exatos (para não enviar spam todos os dias)
            // Aqui usamos um intervalo de 1 dia de margem para o trigger
            const badgesPrestesaExpirar = await ConsultorBadge.findAll({
                where: {
                    DATA_EXPIRACAO: {
                        [Op.not]: null,
                        [Op.between]: [new Date(), dataAlvo30Dias]
                    }
                },
                include: [
                    { 
                        model: Consultor, 
                        include: [
                            { model: Utilizador },
                        ] 
                    },
                    { model: Badge }
                ]
            });

            for (const cb of badgesPrestesaExpirar) {
                const diasRestantes = Math.ceil((new Date(cb.DATA_EXPIRACAO) - dataAtual) / (1000 * 60 * 60 * 24));
                
                // Enviar aviso Apenas nos 30, 15, e 7 dias para evitar spam diário.
                if ([30, 15, 7].includes(diasRestantes)) {
                    
                    const util = cb.Consultor.Utilizador;
                    
                    // Verificar as preferências do utilizador
                    const prefs = await PreferenciasUtilizador.findOne({ where: { ID_UTILIZADOR: util.ID_UTILIZADOR } });
                    const desejaReceberAviso = prefs ? prefs.RECEBER_PUSH_EXPIRACAO : true;

                    const titulo = 'Aviso de Expiração de Competência';
                    const msg = [
                        `O seu badge "${cb.Badge.NOME_BADGE}" irá expirar em ${diasRestantes} dias.`,
                        'Para iniciar a renovação, aceda a Os Meus Badges → Ver Detalhes → Renovar candidatura.',
                        'Os pontos já conquistados permanecem no seu histórico.'
                    ].join('\n\n');

                    if (desejaReceberAviso) {
                        await pushService.sendPush(
                            util.ID_UTILIZADOR,
                            'warning',
                            titulo,
                            msg,
                            'expiracao',
                            'Consultor'
                        );
                    }
                    try {
                        await mailer.sendEmail(
                            util.EMAIL_UTILIZADOR,
                            titulo,
                            `<h2>${titulo}</h2>${msg.split('\n\n').map(paragrafo => `<p>${paragrafo}</p>`).join('')}`,
                            'expiracao',
                            'Consultor'
                        );
                    } catch(err) { console.error("Erro Email CRON:", err); }

                    console.log(`[CRON] Aviso processado para ${util.EMAIL_UTILIZADOR} (${diasRestantes} dias restantes).`);
                }
            }

            // Lembretes de objetivos do consultor (7, 3, 1 dias, no próprio dia e 1 dia em atraso).
            const inicioHoje = new Date(dataAtual);
            inicioHoje.setHours(0, 0, 0, 0);
            const fimHoje = new Date(dataAtual);
            fimHoje.setHours(23, 59, 59, 999);
            const objetivosAtivos = await ObjetivoTimeline.findAll({
                where: {
                    STATUS: {
                        [Op.notIn]: ['Concluído', 'Concluido', 'Concluída', 'Concluida']
                    }
                }
            });

            for (const objetivo of objetivosAtivos) {
                const dataObjetivo = new Date(objetivo.DATA_OBJETIVO);
                dataObjetivo.setHours(0, 0, 0, 0);
                const diasRestantes = Math.ceil((dataObjetivo - inicioHoje) / (1000 * 60 * 60 * 24));
                if (![7, 3, 1, 0, -1].includes(diasRestantes)) continue;

                const utilizador = await Utilizador.findByPk(objetivo.ID_UTILIZADOR);
                if (!utilizador) continue;

                const titulo = diasRestantes < 0
                    ? 'Objetivo em atraso'
                    : (diasRestantes === 0 ? 'Objetivo termina hoje' : 'Lembrete de objetivo');
                const prazo = diasRestantes < 0
                    ? 'terminou ontem'
                    : (diasRestantes === 0
                        ? 'termina hoje'
                        : `termina dentro de ${diasRestantes} ${diasRestantes === 1 ? 'dia' : 'dias'}`);
                const msg = [
                    `O objetivo "${objetivo.TITULO}" ${prazo}.`,
                    'Consulte Objetivos e Timeline para acompanhar ou concluir esta meta.'
                ].join('\n\n');
                const jaEnviado = await Notificacao.findOne({
                    where: {
                        ID_UTILIZADOR: utilizador.ID_UTILIZADOR,
                        TITULO_NOTIFICACAO: titulo,
                        MENSAGEM_NOTIFICACAO: msg,
                        DATA_ENVIO_NOTIFICACAO: { [Op.between]: [inicioHoje, fimHoje] }
                    }
                });
                if (jaEnviado) continue;

                await pushService.sendPush(
                    utilizador.ID_UTILIZADOR,
                    'reminder',
                    titulo,
                    msg,
                    'objetivos',
                    'Consultor'
                );
                try {
                    await mailer.sendEmail(
                        utilizador.EMAIL_UTILIZADOR,
                        titulo,
                        `<h2>${titulo}</h2>${msg.split('\n\n').map(paragrafo => `<p>${paragrafo}</p>`).join('')}`,
                        'objetivos',
                        'Consultor'
                    );
                } catch (err) {
                    console.error('Erro Email de objetivo:', err);
                }
            }
            console.log('[CRON] Verificação concluída.');
        } catch (error) {
            console.error('[CRON] Erro na verificação:', error);
        }
    });
};

module.exports = startCronJobs;
