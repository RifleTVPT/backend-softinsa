const AvisoGeral = require('../models/AvisoGeral');
const Utilizador = require('../models/Utilizador');
const mailer = require('../config/mailer');
const pushService = require('../services/pushService');
const { Op } = require('sequelize');

const controllers = {};

const whereDestinatariosAviso = (visibilidade) => {
    const ativo = { ESTADO_CONTA_UTILIZADOR: 'Ativo' };
    const perfisPorVisibilidade = {
        'Consultor': ['Consultor'],
        'Apenas Consultores': ['Consultor'],
        'Talent Manager': ['Talent Manager'],
        'Service Line Leader': ['Service Line Leader', 'SLL'],
        'SLL': ['Service Line Leader', 'SLL'],
        'Talent + SLL': ['Talent Manager', 'Service Line Leader', 'SLL'],
        'Administrador': ['Administrador'],
        'Apenas Administradores': ['Administrador']
    };
    const perfis = perfisPorVisibilidade[visibilidade];
    if (!perfis || visibilidade === 'Todos') return ativo;
    return {
        ...ativo,
        [Op.or]: perfis.map(perfil => ({
            PERFIL_UTILIZADOR: { [Op.like]: `%${perfil}%` }
        }))
    };
};

controllers.getAllAvisos = async (req, res) => {
    try {
        const perfilPedido = req.query.perfil === 'SLL' ? 'Service Line Leader' : req.query.perfil;
        const visibilidadesPorPerfil = {
            'Consultor': ['Todos', 'Consultor', 'Apenas Consultores'],
            'Talent Manager': ['Todos', 'Talent Manager', 'Talent + SLL'],
            'Service Line Leader': ['Todos', 'Service Line Leader', 'SLL', 'Talent + SLL'],
            'Administrador': ['Todos', 'Administrador', 'Apenas Administradores']
        };
        const visibilidades = visibilidadesPorPerfil[perfilPedido] || ['Todos', perfilPedido];
        const where = perfilPedido
            ? {
                ESTADO_AVISO: 'Ativo',
                VISIBILIDADE_AVISO: { [Op.in]: visibilidades }
            }
            : {};
        const avisos = await AvisoGeral.findAll({ where, order: [['DATA_PUBLICACAO_AVISO', 'DESC']] });
        const mapAvisos = avisos.map(a => ({
            id: a.ID_AVISO,
            titulo: a.TITULO_AVISO,
            mensagem: a.CONTEUDO_AVISO,
            visibilidade: a.VISIBILIDADE_AVISO,
            data: new Date(a.DATA_PUBLICACAO_AVISO).toLocaleDateString('pt-PT'),
            status: a.ESTADO_AVISO
        }));
        res.json({ success: true, data: mapAvisos });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

controllers.createAviso = async (req, res) => {
    try {
        const { titulo, mensagem, visibilidade, status, tipo_notificacao } = req.body;
        const novo = await AvisoGeral.create({
            TITULO_AVISO: titulo,
            CONTEUDO_AVISO: mensagem,
            VISIBILIDADE_AVISO: visibilidade || 'Todos',
            ESTADO_AVISO: status || 'Ativo',
            TIPO_NOTIFICACAO: tipo_notificacao || 'Geral',
            DATA_PUBLICACAO_AVISO: new Date()
        });

        if (novo.ESTADO_AVISO === 'Ativo') {
            try {
                const perfilVisivel = novo.VISIBILIDADE_AVISO === 'SLL' ? 'Service Line Leader' : novo.VISIBILIDADE_AVISO;
                const whereClause = whereDestinatariosAviso(perfilVisivel);
                const users = await Utilizador.findAll({ where: whereClause });
                
                for (const u of users) {
                    try {
                        await mailer.sendEmail(
                            u.EMAIL_UTILIZADOR,
                            `Aviso Importante: ${titulo}`,
                            `<h1>${titulo}</h1><p>${mensagem}</p><hr><p><small>Este é um aviso enviado automaticamente pela Plataforma de Badges Softinsa.</small></p>`,
                            'avisos',
                            u.PERFIL_UTILIZADOR
                        );
                    } catch (e) { console.error("Falha email aviso", e); }

                    try {
                        await pushService.sendPush(
                            u.ID_UTILIZADOR,
                            novo.TIPO_NOTIFICACAO === 'Sistema' ? 'system' : (novo.TIPO_NOTIFICACAO === 'Crítico' ? 'warning' : 'info'),
                            titulo,
                            mensagem,
                            'avisos',
                            u.PERFIL_UTILIZADOR
                        );
                    } catch (e) { console.error("Falha push aviso", e); }
                }
            } catch (err) {
                console.error("Erro ao enviar notificações de aviso:", err);
            }
        }

        res.json({ success: true, data: novo });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

controllers.updateAviso = async (req, res) => {
    try {
        const { id } = req.params;
        const { titulo, mensagem, visibilidade, status, tipo_notificacao } = req.body;
        
        const aviso = await AvisoGeral.findByPk(id);
        if (!aviso) return res.status(404).json({ success: false, message: 'Aviso não encontrado' });

        await aviso.update({
            TITULO_AVISO: titulo,
            CONTEUDO_AVISO: mensagem,
            VISIBILIDADE_AVISO: visibilidade,
            ESTADO_AVISO: status,
            ...(tipo_notificacao ? { TIPO_NOTIFICACAO: tipo_notificacao } : {})
        });

        res.json({ success: true, data: aviso });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

controllers.toggleStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const aviso = await AvisoGeral.findByPk(id);
        if (!aviso) return res.status(404).json({ success: false, message: 'Aviso não encontrado' });

        const newStatus = aviso.ESTADO_AVISO === 'Ativo' ? 'Inativo' : 'Ativo';
        await aviso.update({ ESTADO_AVISO: newStatus });

        res.json({ success: true, data: newStatus });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

controllers.eliminarAviso = async (req, res) => {
    try {
        const { id } = req.params;
        const aviso = await AvisoGeral.findByPk(id);
        if (!aviso) return res.status(404).json({ success: false, message: 'Aviso não encontrado' });

        await aviso.destroy();
        res.json({ success: true, message: 'Aviso eliminado com sucesso' });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

module.exports = controllers;
