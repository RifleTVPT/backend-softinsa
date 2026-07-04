const ConsultorBadge = require('../models/ConsultorBadge');
const Badge = require('../models/Badge');
const Consultor = require('../models/Consultor');
const Utilizador = require('../models/Utilizador');
const Notificacao = require('../models/Notificacao');
const { Op } = require('sequelize');
const { obterServiceLineSLL } = require('../utils/sllServiceLineHelper');

const controllers = {};

const getSL = (badge) => {
    if (!badge || !badge.CATEGORIA_BADGE) return 'Indefinida';
    try {
        const cat = JSON.parse(badge.CATEGORIA_BADGE);
        if (cat.serviceLine) return cat.serviceLine;
    } catch(e) {}
    return badge.CATEGORIA_BADGE;
};

controllers.getBadgesExpiracao = async (req, res) => {
    try {

        const sl = req.query.sl
            ? await obterServiceLineSLL(req.userId, req.query.sl)
            : null;
        if (req.query.sl && !sl) {
            return res.status(400).json({ success: false, message: 'Service Line não identificada.' });
        }
        // Vai buscar todos os badges ativos que tenham data de expiração no futuro
        const badgesExpirar = await ConsultorBadge.findAll({
            where: {
                DATA_EXPIRACAO: {
                    [Op.not]: null,
                    [Op.gt]: new Date() 
                }
            },
            include: [
                { 
                    model: Consultor, 
                    include: [{ model: Utilizador }] 
                },
                { model: Badge }
            ],
            order: [['DATA_EXPIRACAO', 'ASC']]
        });

        const Nivel = require('../models/Nivel');
        const niveis = await Nivel.findAll();
        const mapNivel = {};
        niveis.forEach(n => mapNivel[n.ID_NIVEL] = n.NOME_NIVEL);

        const dadosFormatados = badgesExpirar
        .filter(cb => !sl || getSL(cb.Badge) === sl)
        .map(cb => {
            const hoje = new Date();
            const expData = new Date(cb.DATA_EXPIRACAO);
            const diasRestantes = Math.ceil((expData - hoje) / (1000 * 60 * 60 * 24));

            let nivelStr = mapNivel[cb.Badge.ID_NIVEL] || 'Desconhecido';

            // Extração correta da área do JSON CATEGORIA_BADGE
            let areaName = cb.Badge.CATEGORIA_BADGE;
            try {
                if (cb.Badge.CATEGORIA_BADGE.startsWith('{')) {
                    const obj = JSON.parse(cb.Badge.CATEGORIA_BADGE);
                    areaName = obj.area || areaName;
                }
            } catch(e) {}

            return {
                idConsultor: cb.ID_CONSULTOR,
                idUtilizador: cb.Consultor.Utilizador.ID_UTILIZADOR,
                idBadge: cb.ID_BADGE,
                consultor: cb.Consultor.Utilizador.NOME_COMPLETO_UTILIZADOR,
                sl: getSL(cb.Badge),
                area: areaName, 
                badge: `${cb.Badge.NOME_BADGE} - nível ${nivelStr}`,
                nivel: nivelStr,
                dataAtribuicao: new Date(cb.DATA_ATRIBUICAO_BADGE).toLocaleDateString('pt-PT'),
                dataExpiracao: expData.toLocaleDateString('pt-PT'),
                diasRestantes: diasRestantes
            };
        });

        res.json({ success: true, data: dadosFormatados });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

controllers.notificarConsultor = async (req, res) => {
    try {
        const { idUtilizador, badgeNome, diasRestantes } = req.body;

        const pushService = require('../services/pushService');
        await pushService.sendPush(
            idUtilizador,
            'warning',
            'Aviso Crítico de Expiração',
            'O seu badge "' + badgeNome + '" expira em ' + diasRestantes + ' dias. Inicie o processo de renovação para manter a sua competência ativa. Para renovar, aceda a \'Meus Badges\', selecione o badge correspondente e clique em \'Renovar\'. Caso deixe expirar, o badge sairá da sua galeria (os pontos ganhos mantêm-se associados à sua conta).',
            'expiracao',
            'Consultor'
        );

        res.json({ success: true, message: 'Notificação enviada com sucesso!' });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

module.exports = controllers;
