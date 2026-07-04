//para a parte dos badges atribuidos do SLL

const ConsultorBadge = require('../models/ConsultorBadge');
const Consultor = require('../models/Consultor');
const Utilizador = require('../models/Utilizador');
const Badge = require('../models/Badge');
const { Op } = require('sequelize');
const { obterServiceLineSLL } = require('../utils/sllServiceLineHelper');

const controllers = {};

controllers.getBadgesAtribuidosSL = async (req, res) => {
    try {
        const sl = await obterServiceLineSLL(req.userId, req.query.sl);

        if (!sl) {
            return res.status(400).json({ success: false, message: "Service Line não especificada." });
        }

        // Procura todos os registos na tabela ConsultorBadge (badges já ganhos/aceites)
        const badgesGanhos = await ConsultorBadge.findAll({
            include: [
                { 
                    model: Consultor, 
                    include: [{ model: Utilizador, attributes: ['NOME_COMPLETO_UTILIZADOR'] }]
                },
                { 
                    model: Badge, 
                    where: { 
                        CATEGORIA_BADGE: { [Op.like]: `%${sl}%` } 
                    }
                }
            ],
            order: [['DATA_ATRIBUICAO_BADGE', 'DESC']]
        });

        const Nivel = require('../models/Nivel');
        const niveis = await Nivel.findAll();
        const mapNivel = {};
        niveis.forEach(n => mapNivel[n.ID_NIVEL] = n.NOME_NIVEL);

        // Formatação dos dados para o Frontend (React)
        const formatados = badgesGanhos.filter(cb => {
            try { return JSON.parse(cb.Badge.CATEGORIA_BADGE).serviceLine === sl; }
            catch (e) { return cb.Badge.CATEGORIA_BADGE === sl; }
        }).map(cb => {
            // Usa o nível real que vem da BD
            const nivelLetra = mapNivel[cb.Badge.ID_NIVEL] || 'Desconhecido';

            // Extração correta da área do JSON CATEGORIA_BADGE
            let areaName = cb.Badge.CATEGORIA_BADGE;
            try {
                if (cb.Badge.CATEGORIA_BADGE.startsWith('{')) {
                    const obj = JSON.parse(cb.Badge.CATEGORIA_BADGE);
                    areaName = obj.area || areaName;
                }
            } catch(e) {}

            return {
                id: `${cb.ID_CONSULTOR}-${cb.ID_BADGE}-${new Date(cb.DATA_ATRIBUICAO_BADGE).getTime()}`,
                consultor: cb.Consultor.Utilizador.NOME_COMPLETO_UTILIZADOR,
                area: areaName,
                nomeBadge: cb.Badge.NOME_BADGE,
                nivel: nivelLetra,
                data: cb.DATA_ATRIBUICAO_BADGE,
                pontos: cb.Badge.PONTOS_BADGE
            };
        });

        res.json({ success: true, data: formatados });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

module.exports = controllers;
