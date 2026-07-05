const { Op } = require('sequelize');
const Utilizador = require('../models/Utilizador');
const Consultor = require('../models/Consultor');
const ServiceLine = require('../models/ServiceLine');
const Area = require('../models/Area');
const Nivel = require('../models/Nivel');
const Badge = require('../models/Badge');
const Requisito = require('../models/Requisito');
const ConsultorBadge = require('../models/ConsultorBadge');
const Pedido = require('../models/Pedido');
const Evidencia = require('../models/Evidencia');
const MarcoConquista = require('../models/MarcoConquista');
const MarcoConsultor = require('../models/MarcoConsultor');
const ObjetivoTimeline = require('../models/ObjetivoTimeline');
const Notificacao = require('../models/Notificacao');
const HistoricoPontuacao = require('../models/HistoricoPontuacao');

const controllers = {};

controllers.sincronizarConsultor = async (req, res) => {
    try {
        const idUtilizador = req.userId;
        const utilizador = await Utilizador.findByPk(idUtilizador, {
            attributes: { exclude: ['PASSWORD_UTILIZADOR', 'FCM_TOKEN'] }
        });
        if (!utilizador) {
            return res.status(404).json({ success: false, message: 'Utilizador não encontrado.' });
        }

        const consultor = await Consultor.findOne({ where: { ID_UTILIZADOR: idUtilizador } });
        if (!consultor) {
            return res.status(403).json({ success: false, message: 'O utilizador não tem perfil de consultor.' });
        }

        const pedidos = await Pedido.findAll({ where: { ID_UTILIZADOR: idUtilizador } });
        const idsPedidos = pedidos.map(p => p.ID_PEDIDO);
        const [
            serviceLines, areas, niveis, badges, requisitos, consultorBadges,
            evidencias, marcos, marcosConsultor, objetivos, notificacoes, historicoPontos, todosConsultores
        ] = await Promise.all([
            ServiceLine.findAll(),
            Area.findAll(),
            Nivel.findAll(),
            Badge.findAll(),
            Requisito.findAll(),
            ConsultorBadge.findAll({ where: { ID_CONSULTOR: consultor.ID_CONSULTOR } }),
            idsPedidos.length ? Evidencia.findAll({ where: { ID_PEDIDO: { [Op.in]: idsPedidos } } }) : [],
            MarcoConquista.findAll(),
            MarcoConsultor.findAll({ where: { ID_CONSULTOR: consultor.ID_CONSULTOR } }),
            ObjetivoTimeline.findAll({ where: { ID_UTILIZADOR: idUtilizador } }),
            Notificacao.findAll({
                where: { ID_UTILIZADOR: idUtilizador },
                order: [['DATA_ENVIO_NOTIFICACAO', 'DESC']]
            }),
            HistoricoPontuacao.findAll({ where: { ID_UTILIZADOR: idUtilizador } }),
            Consultor.findAll()
        ]);

        const json = items => items.map(item => item.toJSON());
        res.json({
            success: true,
            data: {
                server_time: new Date().toISOString(),
                utilizador: utilizador.toJSON(),
                consultor: consultor.toJSON(),
                consultores: json(todosConsultores),
                service_lines: json(serviceLines),
                areas: json(areas),
                niveis: json(niveis),
                badges: json(badges),
                requisitos: json(requisitos),
                consultor_badges: json(consultorBadges),
                pedidos: json(pedidos),
                evidencias: json(evidencias),
                marcos: json(marcos),
                marcos_consultor: json(marcosConsultor),
                objetivos: json(objetivos),
                notificacoes: json(notificacoes),
                historico_pontos: json(historicoPontos)
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

module.exports = controllers;
