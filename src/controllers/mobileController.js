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
            const dataSubmissaoExistente = new Date(pedidoExistente.DATA_SUBMISSAO_PEDIDO);
            
            if (dataSubmissaoMobile <= dataSubmissaoExistente) {
                // Pedido da Web é mais recente (ou igual). Ignoramos o do mobile silenciosamente para ele dar sucesso
                return res.status(201).json({ success: true, message: 'Pedido da Web é mais recente, sincronização ignorada.' });
            } else {
                // Pedido mobile é mais recente. Remover o antigo.
                await Evidencia.destroy({ where: { ID_PEDIDO: pedidoExistente.ID_PEDIDO } });
                await pedidoExistente.destroy();
            }
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
        const pastaUploads = path.join(__dirname, '../../uploads');
        if (!fs.existsSync(pastaUploads)) {
            fs.mkdirSync(pastaUploads, { recursive: true });
        }

        for (const ev of evidencias) {
            if (!ev.base64) continue;

            const nomeSeguro = ev.NOME_FICHEIRO.replace(/[^a-zA-Z0-9.\-_]/g, '');
            const nomeFinal = `${Date.now()}-${Math.round(Math.random() * 1e9)}-${nomeSeguro}`;
            const caminhoFicheiro = path.join(pastaUploads, nomeFinal);

            const buffer = Buffer.from(ev.base64, 'base64');
            fs.writeFileSync(caminhoFicheiro, buffer);

            await Evidencia.create({
                ID_PEDIDO: novoPedido.ID_PEDIDO,
                NOME_FICHEIRO: nomeFinal,
                URL_FICHEIRO: `/uploads/${nomeFinal}`,
                ID_REQUISITO: ev.REQUISITO_MAPEADO || null,
                REQUISITO_MAPEADO: null 
            });
        }

        return res.status(201).json({ success: true, message: 'Pedido sincronizado com sucesso.' });

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
                const obj = await ObjetivoTimeline.create({
                    ID_UTILIZADOR: dados.ID_UTILIZADOR,
                    TITULO: dados.TITULO,
                    DESCRICAO: dados.DESCRICAO || null,
                    DATA_OBJETIVO: dados.DATA_OBJETIVO,
                    STATUS: dados.STATUS || 'Em Progresso',
                    ORIGEM: dados.ORIGEM || 'Criado por mim',
                    TIPO_OBJETIVO: dados.TIPO_OBJETIVO || 'Outro'
                }, { transaction: t });
                
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
        await t.commit();
        res.json({ success: true, message: 'Objetivos sincronizados com sucesso!' });
    } catch (error) {
        await t.rollback();
        console.error('Erro na sincronização de objetivos:', error);
        res.status(500).json({ success: false, message: 'Erro interno na sincronização', error: error.message });
    }
};

module.exports = controllers;
