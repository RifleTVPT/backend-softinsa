const { Op } = require('sequelize');
const sequelize = require('../config/database');
const fs = require('fs');
const path = require('path');
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
const { getApiOrigin, uploadBuffer } = require('../services/cloudFileService');
const pushService = require('../services/pushService');

const controllers = {};

const inferMimeFromName = (name = '') => {
    const ext = path.extname(String(name)).toLowerCase();
    const mimes = {
        '.pdf': 'application/pdf',
        '.txt': 'text/plain; charset=utf-8',
        '.csv': 'text/csv; charset=utf-8',
        '.json': 'application/json',
        '.png': 'image/png',
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.webp': 'image/webp',
        '.gif': 'image/gif',
        '.svg': 'image/svg+xml',
        '.doc': 'application/msword',
        '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        '.xls': 'application/vnd.ms-excel',
        '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        '.ppt': 'application/vnd.ms-powerpoint',
        '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation'
    };
    return mimes[ext] || 'application/octet-stream';
};

const urlPublicaEvidencia = (req, evidencia) => {
    if (!evidencia.URL_FICHEIRO || String(evidencia.URL_FICHEIRO).includes('/uploads/simulacao/')) {
        return evidencia.URL_FICHEIRO;
    }
    const nome = encodeURIComponent(path.basename(evidencia.NOME_FICHEIRO || 'ficheiro'));
    return `${getApiOrigin(req)}/ficheiros/evidencias/${evidencia.ID_EVIDENCIA}/${nome}`;
};

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
        const evidenciasJson = evidencias.map(evidencia => ({
            ...evidencia.toJSON(),
            URL_FICHEIRO_ORIGINAL: evidencia.URL_FICHEIRO,
            URL_FICHEIRO: urlPublicaEvidencia(req, evidencia)
        }));
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
                evidencias: evidenciasJson,
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

controllers.receberPedidoMobile = async (req, res) => {
    try {
        const idUtilizadorLogado = req.userId;
        const payload = req.body;
        
        if (idUtilizadorLogado !== payload.ID_UTILIZADOR) {
             return res.status(403).json({ success: false, message: 'ID de utilizador inválido.' });
        }

        const idBadge = payload.ID_BADGE;
        const dataSubmissaoMobile = new Date(payload.DATA_SUBMISSAO_PEDIDO);

        // 1. Procurar pedido existente não rascunho/recusado
        let pedidoExistente = await Pedido.findOne({
            where: {
                ID_UTILIZADOR: idUtilizadorLogado,
                ID_BADGE: idBadge,
                ESTADO_PEDIDO: { [Op.notIn]: ['Rascunho', 'Recusado'] }
            }
        });

        if (pedidoExistente) {
            return res.status(201).json({
                success: true,
                message: 'Já existe um pedido ativo para este badge.',
                idPedido: pedidoExistente.ID_PEDIDO
            });
        }

        // 2. Apagar Rascunhos se existirem na web
        await Pedido.destroy({
            where: {
                ID_UTILIZADOR: idUtilizadorLogado,
                ID_BADGE: idBadge,
                ESTADO_PEDIDO: 'Rascunho'
            }
        });

        // 3. Criar o novo Pedido
        const novoPedido = await Pedido.create({
            ID_UTILIZADOR: idUtilizadorLogado,
            ID_BADGE: idBadge,
            DATA_SUBMISSAO_PEDIDO: dataSubmissaoMobile,
            DATA_ULTIMA_ATUALIZACAO: new Date(),
            ESTADO_PEDIDO: 'Pendente'
        });

        // 4. Processar Evidências (Base64)
        const evidencias = payload.evidencias || [];

        for (const ev of evidencias) {
            if (!ev.base64) continue;

            const nomeSeguro = (ev.NOME_FICHEIRO || 'evidencia').replace(/[^a-zA-Z0-9.\-_]/g, '');
            const buffer = Buffer.from(ev.base64, 'base64');
            const uploaded = await uploadBuffer(req, buffer, {
                folder: 'softinsa/evidencias',
                originalname: nomeSeguro,
                mimetype: ev.MIME_TYPE || ev.mimeType || inferMimeFromName(nomeSeguro),
                resourceType: 'auto'
            });

            await Evidencia.create({
                ID_PEDIDO: novoPedido.ID_PEDIDO,
                NOME_FICHEIRO: nomeSeguro,
                URL_FICHEIRO: uploaded.url,
                ID_REQUISITO: ev.REQUISITO_MAPEADO || null,
                REQUISITO_MAPEADO: null
            });
        }

        const [utilizador, badgeSubmetido, talentManagers] = await Promise.all([
            Utilizador.findByPk(idUtilizadorLogado),
            Badge.findByPk(idBadge),
            Utilizador.findAll({
                where: {
                    ESTADO_CONTA_UTILIZADOR: 'Ativo',
                    PERFIL_UTILIZADOR: { [Op.like]: '%Talent Manager%' }
                }
            })
        ]);

        const nomeConsultor = utilizador?.NOME_COMPLETO_UTILIZADOR || `Utilizador ${idUtilizadorLogado}`;
        const nomeBadge = badgeSubmetido?.NOME_BADGE || `Badge ${idBadge}`;
        const mensagemTalent = `${nomeConsultor} submeteu uma candidatura ao badge "${nomeBadge}" através da app mobile. Aceda a Validações → Pedidos Pendentes para analisar as evidências.`;
        for (const talent of talentManagers) {
            pushService.sendPush(
                talent.ID_UTILIZADOR,
                'info',
                'Nova Candidatura para Validação',
                mensagemTalent,
                'pedidos',
                'Talent Manager'
            );
        }

        return res.status(201).json({ success: true, message: 'Pedido sincronizado com sucesso.', idPedido: novoPedido.ID_PEDIDO });

    } catch (error) {
        console.error("Erro na sincronização:", error);
        return res.status(500).json({ success: false, message: error.message });
    }
};

controllers.sincronizarObjetivosOffline = async (req, res) => {
    const { acoes } = req.body;
    if (!acoes || !Array.isArray(acoes)) {
        return res.status(400).json({ success: false, message: 'Dados inválidos' });
    }

    const t = await sequelize.transaction();
    try {
        const mapIds = {};
        for (const acao of acoes) {
            const dados = acao.DADOS;
            if (acao.TIPO_ACAO === 'CRIAR') {
                let dataObj = new Date(dados.DATA_OBJETIVO);
                if (isNaN(dataObj.getTime())) {
                    // Se o mobile enviou DD/MM/YYYY ou outro formato inválido, converter
                    if (typeof dados.DATA_OBJETIVO === 'string' && dados.DATA_OBJETIVO.includes('/')) {
                        const parts = dados.DATA_OBJETIVO.split('/');
                        if (parts.length === 3) {
                            dataObj = new Date(`${parts[2]}-${parts[1]}-${parts[0]}`);
                        }
                    }
                    if (isNaN(dataObj.getTime())) {
                        dataObj = new Date(); // Fallback absoluto
                    }
                }

                const [obj] = await ObjetivoTimeline.findOrCreate({
                    where: {
                        ID_UTILIZADOR: dados.ID_UTILIZADOR,
                        TITULO: dados.TITULO,
                        DATA_OBJETIVO: dataObj,
                        TIPO_OBJETIVO: dados.TIPO_OBJETIVO || 'Outro'
                    },
                    defaults: {
                        DESCRICAO: dados.DESCRICAO || null,
                        STATUS: dados.STATUS || 'Em Progresso',
                        ORIGEM: dados.ORIGEM || 'Criado por mim'
                    },
                    transaction: t
                });
                
                if (dados.ID_OBJETIVO_LOCAL) {
                    mapIds[dados.ID_OBJETIVO_LOCAL] = obj.ID_OBJETIVO;
                }
            } else if (acao.TIPO_ACAO === 'CONCLUIR') {
                let targetId = dados.ID_OBJETIVO;
                if (mapIds[targetId]) {
                    targetId = mapIds[targetId];
                }
                
                await ObjetivoTimeline.update(
                    { STATUS: 'Concluído', DATA_CONCLUSAO: new Date() },
                    { where: { ID_OBJETIVO: targetId }, transaction: t }
                );
            }
        }
        await sequelize.query(`
            DELETE FROM "OBJETIVO_TIMELINE"
            WHERE "ID_OBJETIVO" NOT IN (
                SELECT id_keep FROM (
                    SELECT MIN("ID_OBJETIVO") AS id_keep
                    FROM "OBJETIVO_TIMELINE"
                    GROUP BY "ID_UTILIZADOR", "TITULO", "DATA_OBJETIVO", "TIPO_OBJETIVO"
                ) AS objetivos_unicos
            )
        `, { transaction: t });
        await t.commit();
        res.json({ success: true, message: 'Objetivos sincronizados com sucesso!' });
    } catch (error) {
        await t.rollback();
        console.error('Erro na sincronização de objetivos:', error);
        res.status(500).json({ success: false, message: 'Erro interno na sincronização', error: error.message });
    }
};

module.exports = controllers;
