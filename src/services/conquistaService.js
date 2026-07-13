const { Op } = require('sequelize');
const MarcoConquista = require('../models/MarcoConquista');
const MarcoConsultor = require('../models/MarcoConsultor');
const ConsultorBadge = require('../models/ConsultorBadge');
const HistoricoPontuacao = require('../models/HistoricoPontuacao');
const LogAtividadeSistema = require('../models/LogAtividadeSistema');
const pushService = require('./pushService');
const Utilizador = require('../models/Utilizador');
const mailer = require('../config/mailer');

async function avaliarConquistasConsultor(consultor) {
    const marcos = await MarcoConquista.findAll();
    const ganhos = await MarcoConsultor.findAll({
        where: { ID_CONSULTOR: consultor.ID_CONSULTOR }
    });
    const idsGanhos = new Set(ganhos.map(g => g.ID_MARCO));
    const totalBadges = await ConsultorBadge.count({
        where: { ID_CONSULTOR: consultor.ID_CONSULTOR }
    });
    let pontosAtuais = consultor.PONTUACAO_TOTAL || 0;

    for (const marco of marcos) {
        if (idsGanhos.has(marco.ID_MARCO)) continue;

        let cumprido = false;
        if (marco.TIPO_MARCO === 'TOTAL_BADGES') {
            cumprido = totalBadges >= (marco.PARAMETRO_1 || 0);
        } else if (marco.TIPO_MARCO === 'TOTAL_PONTOS') {
            cumprido = pontosAtuais >= (marco.PARAMETRO_1 || 0);
        } else if (marco.TIPO_MARCO === 'BADGES_DIAS') {
            const desde = new Date();
            desde.setDate(desde.getDate() - (marco.PARAMETRO_2 || 0));
            const totalPeriodo = await ConsultorBadge.count({
                where: {
                    ID_CONSULTOR: consultor.ID_CONSULTOR,
                    DATA_ATRIBUICAO_BADGE: { [Op.gte]: desde }
                }
            });
            cumprido = totalPeriodo >= (marco.PARAMETRO_1 || 0);
        }

        if (!cumprido) continue;

        await MarcoConsultor.create({
            ID_CONSULTOR: consultor.ID_CONSULTOR,
            ID_MARCO: marco.ID_MARCO,
            DATA_CONQUISTA: new Date()
        });
        idsGanhos.add(marco.ID_MARCO);
        const bonus = marco.PONTOS_EXTRA || 0;
        pontosAtuais += bonus;
        await HistoricoPontuacao.create({
            ID_UTILIZADOR: consultor.ID_UTILIZADOR,
            DATA_ATRIBUICAO: new Date(),
            PONTOS_OBTIDOS: bonus,
            ORIGEM_PONTOS: `Badge premium: ${marco.TITULO_MARCO}`
        });
        await LogAtividadeSistema.create({
            ID_UTILIZADOR: consultor.ID_UTILIZADOR,
            TIPO_ATIVIDADE: 'Badge Premium Obtido',
            DETALHES_ATIVIDADE: `Ganhou automaticamente o badge premium ${marco.TITULO_MARCO}`,
            DATA_HORA_ATIVIDADE: new Date()
        });
        const mensagemPremium = [
            `Parabéns, obteve a conquista especial "${marco.TITULO_MARCO}"!`,
            'Esta conquista premium foi atribuída automaticamente por cumprir a regra definida na plataforma.',
            `Pontos bónus adicionados: +${bonus}.`,
            'Para consultar esta conquista, aceda a Conquistas Especiais.',
            'As conquistas especiais aparecem com destaque dourado e podem ser consultadas, partilhadas e validadas através da página pública.'
        ].join('\n\n');
        await pushService.sendPush(
            consultor.ID_UTILIZADOR,
            'success',
            'Novo Badge Premium Obtido',
            mensagemPremium,
            'badges',
            'Consultor'
        );
        try {
            const utilizador = await Utilizador.findByPk(consultor.ID_UTILIZADOR);
            if (utilizador) {
                await mailer.sendEmail(
                    utilizador.EMAIL_UTILIZADOR,
                    'Novo Badge Premium Obtido - Plataforma de Badges Softinsa',
                    `<h2>Novo Badge Premium Obtido</h2><p>Olá, ${utilizador.NOME_COMPLETO_UTILIZADOR}.</p>${mensagemPremium.split('\n\n').map(paragrafo => `<p>${paragrafo}</p>`).join('')}`,
                    'badges',
                    utilizador.PERFIL_UTILIZADOR
                );
            }
        } catch (mailErr) {
            console.error('Falha ao enviar email de badge premium obtido:', mailErr);
        }
    }

    if (pontosAtuais !== consultor.PONTUACAO_TOTAL) {
        await consultor.update({ PONTUACAO_TOTAL: pontosAtuais });
    }
}

module.exports = { avaliarConquistasConsultor };
