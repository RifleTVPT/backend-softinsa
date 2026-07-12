const Utilizador = require('../models/Utilizador');
const Consultor = require('../models/Consultor');
const TalentManager = require('../models/TalentManager');
const ServiceLineLeader = require('../models/ServiceLineLeader');
const Administrador = require('../models/Administrador');
const Badge = require('../models/Badge');
const ConsultorBadge = require('../models/ConsultorBadge');
const Pedido = require('../models/Pedido');
const Requisito = require('../models/Requisito');
const Evidencia = require('../models/Evidencia');
const mailer = require('../config/mailer');
const pushService = require('../services/pushService');
const LogAtividadeSistema = require('../models/LogAtividadeSistema');
const Area = require('../models/Area');
const ServiceLine = require('../models/ServiceLine');
const MarcoConsultor = require('../models/MarcoConsultor');
const { Op } = require('sequelize');

const controllers = {};
const passwordForte = password => /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^a-zA-Z\d]).{8,}$/.test(String(password || ''));

const obterAreaPorNomeEServiceLine = async (nomeArea, nomeSL) => {
    if (!nomeArea || nomeArea === 'N/A') return null;
    const where = { NOME_AREA: nomeArea };
    if (nomeSL && nomeSL !== 'N/A') {
        const slObj = await ServiceLine.findOne({ where: { NOME_SERVICE_LINE: nomeSL } });
        if (slObj) where.ID_SERVICE_LINE = slObj.ID_SERVICE_LINE;
    }
    return Area.findOne({ where });
};

const enviarAvisoContaAdmin = async (user, titulo, html, pushMsg = null) => {
    try {
        await mailer.sendEmail(user.EMAIL_UTILIZADOR, titulo, html, 'contas', user.PERFIL_UTILIZADOR);
    } catch (mailErr) {
        console.error(`Falha ao enviar email "${titulo}".`, mailErr);
    }
    if (pushMsg) {
        try {
            await pushService.sendPush(user.ID_UTILIZADOR, 'system', titulo, pushMsg, 'contas', user.PERFIL_UTILIZADOR);
        } catch (pushErr) {
            console.error(`Falha ao enviar notificação "${titulo}".`, pushErr);
        }
    }
};

// 1. Listar todos os utilizadores
controllers.getTodosUtilizadores = async (req, res) => {
    try {
        const users = await Utilizador.findAll({
            order: [['DATA_REGISTO_UTILIZADOR', 'DESC']]
        });

        const listaFormatada = users.map(u => ({
            id: u.ID_UTILIZADOR,
            nome: u.NOME_COMPLETO_UTILIZADOR,
            foto: u.URL_FOTO || null,
            email: u.EMAIL_UTILIZADOR,
            // Separa os perfis num array para o frontend
            perfis: u.PERFIL_UTILIZADOR ? u.PERFIL_UTILIZADOR.split(' / ') : ['Sem Perfil'],
            sl: u.SL_REGISTO || 'N/A', 
            area: u.AREA_REGISTO || 'N/A',
            acesso: new Date(u.DATA_REGISTO_UTILIZADOR).toLocaleDateString('pt-PT'),
            status: u.ESTADO_CONTA_UTILIZADOR
        }));

        res.json({ success: true, data: listaFormatada });
    } catch (error) {
        console.error("ERRO LISTA USERS:", error);
        res.status(500).json({ success: false, message: error.message });
    }
};

// 2. Criar novo utilizador (Suporta múltiplos perfis)
controllers.criarUtilizador = async (req, res) => {
    try {
        const { nome, email, perfis, sl, area, passwordTemporaria } = req.body;

        const emailExiste = await Utilizador.findOne({ where: { EMAIL_UTILIZADOR: email } });
        if (emailExiste) {
            return res.status(400).json({ success: false, message: 'Este email já se encontra registado.' });
        }

        // Junta o array de perfis com uma barra (ex: "Consultor / Talent Manager")
        const perfisString = (perfis && perfis.length > 0) ? perfis.join(' / ') : 'Consultor';
        const passwordInicial = passwordTemporaria || 'Softinsa@2026';

        const novoUser = await Utilizador.create({
            ID_ADMIN: 1, 
            ID_OBJETIVO: 1,
            NOME_COMPLETO_UTILIZADOR: nome,
            EMAIL_UTILIZADOR: email,
            ESTADO_CONTA_UTILIZADOR: 'Ativo', // Forçamos 'Ativo' com 'O' para a BD
            DATA_REGISTO_UTILIZADOR: new Date(),
            PERFIL_UTILIZADOR: perfisString,
            PASSWORD_UTILIZADOR: passwordInicial,
            IS_PRIMEIRO_ACESSO: true,
            SL_REGISTO: sl,
            AREA_REGISTO: area
        });

        // Consoante os perfis escolhidos, insere nas tabelas correspondentes
        if (perfis.includes('Consultor')) {
            const areaSelecionada = area ? await Area.findOne({ where: { NOME_AREA: area } }) : null;
            await Consultor.create({ ID_UTILIZADOR: novoUser.ID_UTILIZADOR, DATA_ENTRADA_EMPRESA: new Date(), PONTUACAO_TOTAL: 0, ID_AREA: areaSelecionada?.ID_AREA || null });
        }
        if (perfis.includes('Talent Manager')) {
            await TalentManager.create({ ID_UTILIZADOR: novoUser.ID_UTILIZADOR, DATA_INICIO_FUNC: new Date() });
        }
        if (perfis.includes('Service Line Leader')) {
            await ServiceLineLeader.create({ ID_UTILIZADOR: novoUser.ID_UTILIZADOR, CARGO_SLL: 'Líder de Área', DATA_INICIO_FUNCOES: new Date() });
        }
        if (perfis.includes('Administrador')) {
            await Administrador.create({ ID_UTILIZADOR: novoUser.ID_UTILIZADOR, DATA_REGISTO_PLATAFORMA: new Date() });
        }

        await LogAtividadeSistema.create({ ID_UTILIZADOR: req.userId || 1, TIPO_ATIVIDADE: 'Criação de Utilizador', DETALHES_ATIVIDADE: `Criou o utilizador ${nome} com os perfis ${perfisString}`, DATA_HORA_ATIVIDADE: new Date() });

        try {
            const mailer = require('../config/mailer');
            mailer.sendEmail(
                email,
                'Conta Criada - Plataforma de Badges Softinsa',
                `<h1>Olá, ${nome}</h1><p>A sua conta foi criada pelo Administrador.</p><p>A sua password temporária é: <b>${passwordInicial}</b></p><p>No seu primeiro acesso, ser-lhe-á pedido para alterar esta password.</p>`, 'contas', perfisString);
        } catch (mailErr) {
            console.error("Falha ao enviar email de criação.", mailErr);
        }

        res.status(201).json({ success: true, message: "Utilizador criado com sucesso!" });
    } catch (error) {
        console.error("ERRO CRIAR USER:", error);
        res.status(500).json({ success: false, message: error.message });
    }
};

// 3. Obter Perfil
controllers.getPerfilUtilizador = async (req, res) => {
    try {
        const { id } = req.params;
        const u = await Utilizador.findByPk(id);
        
        if (!u) return res.status(404).json({ success: false, message: "Utilizador não encontrado." });

        let progressoSL = 0;
        let aprendizagens = [];

        if (u.PERFIL_UTILIZADOR && u.PERFIL_UTILIZADOR.includes('Consultor')) {
            const totalBadges = await Badge.count();
            
            const consultor = await Consultor.findOne({ where: { ID_UTILIZADOR: id } });
            if (consultor) {
                const obtainedBadges = await ConsultorBadge.count({ where: { ID_CONSULTOR: consultor.ID_CONSULTOR } });
                progressoSL = totalBadges > 0 ? Math.round((obtainedBadges / totalBadges) * 100) : 0;

                const pedidos = await Pedido.findAll({
                    where: { 
                        ID_UTILIZADOR: id,
                        ESTADO_PEDIDO: { [Op.in]: ['Pendente', 'Em Análise SLL', 'Pendente de Correção', 'Rascunho'] } 
                    },
                    include: [{ model: Badge }]
                });

                for (let p of pedidos) {
                    if (!p.Badge) continue;
                    const totalReq = await Requisito.count({ where: { ID_BADGE: p.Badge.ID_BADGE } });
                    const evidencias = await Evidencia.findAll({
                        where: { ID_PEDIDO: p.ID_PEDIDO },
                        attributes: ['ID_REQUISITO']
                    });
                    const requisitosComEvidencia = new Set(
                        evidencias
                            .filter(e => e.ID_REQUISITO !== null)
                            .map(e => e.ID_REQUISITO)
                    ).size;
                    let prog = totalReq > 0 ? Math.round((requisitosComEvidencia / totalReq) * 100) : 0;
                    if (prog > 100) prog = 100;
                    aprendizagens.push({ titulo: p.Badge.NOME_BADGE, progresso: prog });
                }
            }
        }

        const userData = {
            id: u.ID_UTILIZADOR,
            nome: u.NOME_COMPLETO_UTILIZADOR,
            foto: u.URL_FOTO || null,
            email: u.EMAIL_UTILIZADOR,
            perfis: u.PERFIL_UTILIZADOR ? u.PERFIL_UTILIZADOR.split(' / ') : ['Sem Perfil'],
            sl: u.SL_REGISTO || 'N/A',
            area: u.AREA_REGISTO || 'N/A',
            acesso: new Date(u.DATA_REGISTO_UTILIZADOR).toLocaleDateString('pt-PT'),
            status: u.ESTADO_CONTA_UTILIZADOR,
            progressoSL: progressoSL,
            aprendizagens: aprendizagens
        };

        res.json({ success: true, data: userData });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// 4. Atualizar Perfil
controllers.atualizarUtilizador = async (req, res) => {
    try {
        const { id } = req.params;
        const { nome, email, perfis, sl, area, novaPassword } = req.body;

        const u = await Utilizador.findByPk(id);
        if (!u) return res.status(404).json({ success: false, message: "Utilizador não encontrado." });

        const emailEmUso = await Utilizador.findOne({ where: { EMAIL_UTILIZADOR: email, ID_UTILIZADOR: { [Op.ne]: id } } });
        if (emailEmUso) return res.status(400).json({ success: false, message: 'Este email já se encontra registado.' });

        const perfisString = (perfis && perfis.length > 0) ? perfis.join(' / ') : u.PERFIL_UTILIZADOR;
        const permissoesAlteradas = u.PERFIL_UTILIZADOR !== perfisString;
        const oldPerfis = u.PERFIL_UTILIZADOR || '';

        const camposAtualizar = {
                NOME_COMPLETO_UTILIZADOR: nome, 
                EMAIL_UTILIZADOR: email,
                PERFIL_UTILIZADOR: perfisString,
                SL_REGISTO: sl !== undefined ? sl : u.SL_REGISTO,
                AREA_REGISTO: area !== undefined ? area : u.AREA_REGISTO
        };
        if (novaPassword) {
            if (!passwordForte(novaPassword)) {
                return res.status(400).json({ success: false, message: 'A password deve ter 8+ caracteres, uma maiúscula, uma minúscula, um número e um caractere especial.' });
            }
            camposAtualizar.PASSWORD_UTILIZADOR = novaPassword;
        }

        await Utilizador.update(
            camposAtualizar,
            { where: { ID_UTILIZADOR: id }, individualHooks: Boolean(novaPassword) }
        );

        const userAtualizado = await Utilizador.findByPk(id);

        if (perfisString.includes('Consultor')) {
            const consultorExistente = await Consultor.findOne({ where: { ID_UTILIZADOR: id } });
            if (consultorExistente) {
                const areaAtualizada = await obterAreaPorNomeEServiceLine(userAtualizado.AREA_REGISTO, userAtualizado.SL_REGISTO);
                await consultorExistente.update({ ID_AREA: areaAtualizada?.ID_AREA || null });
            }
        }

        if (permissoesAlteradas) {
            const antigos = oldPerfis.split(' / ').filter(Boolean);
            const novos = perfisString.split(' / ').filter(Boolean);
            const removidos = antigos.filter(perfil => !novos.includes(perfil));
            const adicionados = novos.filter(perfil => !antigos.includes(perfil));

            if (removidos.includes('Consultor')) {
                const consultor = await Consultor.findOne({ where: { ID_UTILIZADOR: id } });
                if (consultor) {
                    await ConsultorBadge.destroy({ where: { ID_CONSULTOR: consultor.ID_CONSULTOR } });
                    await MarcoConsultor.destroy({ where: { ID_CONSULTOR: consultor.ID_CONSULTOR } });
                    await consultor.destroy();
                }
            }
            if (removidos.includes('Talent Manager')) await TalentManager.destroy({ where: { ID_UTILIZADOR: id } });
            if (removidos.includes('Service Line Leader')) await ServiceLineLeader.destroy({ where: { ID_UTILIZADOR: id } });
            if (removidos.includes('Administrador')) await Administrador.destroy({ where: { ID_UTILIZADOR: id } });

            if (adicionados.includes('Consultor')) {
                const areaSelecionada = await obterAreaPorNomeEServiceLine(userAtualizado.AREA_REGISTO, userAtualizado.SL_REGISTO);
                await Consultor.create({ ID_UTILIZADOR: id, DATA_ENTRADA_EMPRESA: new Date(), PONTUACAO_TOTAL: 0, ID_AREA: areaSelecionada?.ID_AREA || null });
            }
            if (adicionados.includes('Talent Manager')) await TalentManager.create({ ID_UTILIZADOR: id, DATA_INICIO_FUNC: new Date() });
            if (adicionados.includes('Service Line Leader')) await ServiceLineLeader.create({ ID_UTILIZADOR: id, CARGO_SLL: 'Líder de Service Line', DATA_INICIO_FUNCOES: new Date() });
            if (adicionados.includes('Administrador')) await Administrador.create({ ID_UTILIZADOR: id, DATA_REGISTO_PLATAFORMA: new Date() });

            try {
                const mailer = require('../config/mailer');
                mailer.sendEmail(
                    userAtualizado.EMAIL_UTILIZADOR,
                    'Permissões de Conta Alteradas - Plataforma Softinsa',
                    `<h1>Olá, ${userAtualizado.NOME_COMPLETO_UTILIZADOR}</h1><p>As suas permissões de perfil foram atualizadas pelo Administrador.</p><p>O seu perfil atual é: <b>${perfisString}</b>.</p><p>Se considerar que se trata de um erro, por favor contacte a administração.</p>`, 'contas', perfisString);
            } catch (mailErr) {
                console.error("Falha ao enviar email de alteração de permissões.", mailErr);
            }
            try {
                await pushService.sendPush(
                    userAtualizado.ID_UTILIZADOR,
                    'system',
                    'Permissões de Conta Alteradas',
                    `As suas permissões foram atualizadas. Perfil atual: ${perfisString}.`,
                    'contas',
                    perfisString
                );
            } catch (pushErr) {
                console.error("Falha ao enviar notificação de alteração de permissões.", pushErr);
            }
        }

        if (u.NOME_COMPLETO_UTILIZADOR !== userAtualizado.NOME_COMPLETO_UTILIZADOR) {
            await enviarAvisoContaAdmin(
                userAtualizado,
                'Nome de Conta Atualizado',
                `<h1>Olá, ${userAtualizado.NOME_COMPLETO_UTILIZADOR}</h1><p>O nome associado à sua conta foi atualizado pelo Administrador.</p>`,
                'O nome associado à sua conta foi atualizado pelo Administrador.'
            );
        }
        if (u.EMAIL_UTILIZADOR !== userAtualizado.EMAIL_UTILIZADOR) {
            await enviarAvisoContaAdmin(
                userAtualizado,
                'Email de Conta Atualizado',
                `<h1>Olá, ${userAtualizado.NOME_COMPLETO_UTILIZADOR}</h1><p>O email associado à sua conta foi atualizado para <b>${userAtualizado.EMAIL_UTILIZADOR}</b>.</p><p>Use este endereço no próximo início de sessão.</p>`,
                `O email associado à sua conta foi atualizado para ${userAtualizado.EMAIL_UTILIZADOR}.`
            );
        }
        if (novaPassword) {
            await enviarAvisoContaAdmin(
                userAtualizado,
                'Password de Conta Atualizada',
                `<h1>Olá, ${userAtualizado.NOME_COMPLETO_UTILIZADOR}</h1><p>A password da sua conta foi atualizada pelo Administrador.</p><p>Se não reconhece esta alteração, contacte a administração da plataforma.</p>`,
                'A password da sua conta foi atualizada pelo Administrador.'
            );
        }

        const alteracoes = [];
        if (u.NOME_COMPLETO_UTILIZADOR !== userAtualizado.NOME_COMPLETO_UTILIZADOR) alteracoes.push(`nome: ${u.NOME_COMPLETO_UTILIZADOR} -> ${userAtualizado.NOME_COMPLETO_UTILIZADOR}`);
        if (u.EMAIL_UTILIZADOR !== userAtualizado.EMAIL_UTILIZADOR) alteracoes.push(`email: ${u.EMAIL_UTILIZADOR} -> ${userAtualizado.EMAIL_UTILIZADOR}`);
        if (oldPerfis !== perfisString) alteracoes.push(`perfis: ${oldPerfis} -> ${perfisString}`);
        if (novaPassword) alteracoes.push('password alterada');
        if ((u.SL_REGISTO || '') !== (userAtualizado.SL_REGISTO || '')) alteracoes.push(`service line: ${u.SL_REGISTO || 'N/A'} -> ${userAtualizado.SL_REGISTO || 'N/A'}`);
        if ((u.AREA_REGISTO || '') !== (userAtualizado.AREA_REGISTO || '')) alteracoes.push(`área: ${u.AREA_REGISTO || 'N/A'} -> ${userAtualizado.AREA_REGISTO || 'N/A'}`);

        await LogAtividadeSistema.create({
            ID_UTILIZADOR: req.userId || 1,
            TIPO_ATIVIDADE: 'Atualização de Utilizador',
            DETALHES_ATIVIDADE: `Atualizou ${userAtualizado.NOME_COMPLETO_UTILIZADOR}${alteracoes.length ? ` (${alteracoes.join('; ')})` : ''}`,
            DATA_HORA_ATIVIDADE: new Date()
        });
        res.json({ success: true, message: "Perfil atualizado!" });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// 5. Desativar Utilizador
controllers.desativarUtilizador = async (req, res) => {
    try {
        const { id } = req.params;
        const u = await Utilizador.findByPk(id);
        if (!u) return res.status(404).json({ success: false, message: "Utilizador não encontrado." });

        await Utilizador.update(
            { ESTADO_CONTA_UTILIZADOR: 'Inativo' },
            { where: { ID_UTILIZADOR: id } }
        );

        try {
            const mailer = require('../config/mailer');
            mailer.sendEmail(
                u.EMAIL_UTILIZADOR,
                'Conta Desativada - Plataforma Softinsa',
                `<h1>Olá, ${u.NOME_COMPLETO_UTILIZADOR}</h1><p>A sua conta na plataforma de Badges foi desativada pelo Administrador.</p><p>Já não terá acesso à plataforma. Para mais informações, contacte a equipa de recursos humanos.</p>`, 'contas', u.PERFIL_UTILIZADOR);
        } catch (mailErr) {
            console.error("Falha ao enviar email de desativação.", mailErr);
        }

        await LogAtividadeSistema.create({ ID_UTILIZADOR: req.userId || 1, TIPO_ATIVIDADE: 'Desativação de Conta', DETALHES_ATIVIDADE: `Desativou a conta de ${u.NOME_COMPLETO_UTILIZADOR}`, DATA_HORA_ATIVIDADE: new Date() });
        res.json({ success: true, message: "Utilizador desativado com sucesso." });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// 5.1. Ativar Utilizador
controllers.ativarUtilizador = async (req, res) => {
    try {
        const { id } = req.params;
        const u = await Utilizador.findByPk(id);
        if (!u) return res.status(404).json({ success: false, message: "Utilizador não encontrado." });

        await Utilizador.update(
            { ESTADO_CONTA_UTILIZADOR: 'Ativo' },
            { where: { ID_UTILIZADOR: id } }
        );

        try {
            const mailer = require('../config/mailer');
            mailer.sendEmail(
                u.EMAIL_UTILIZADOR,
                'Conta Reativada - Plataforma Softinsa',
                `<h1>Olá, ${u.NOME_COMPLETO_UTILIZADOR}</h1><p>Boas notícias! A sua conta na plataforma de Badges foi reativada pelo Administrador.</p><p>Já pode voltar a aceder com as suas credenciais.</p>`, 'contas', u.PERFIL_UTILIZADOR);
        } catch (mailErr) {
            console.error("Falha ao enviar email de ativação.", mailErr);
        }

        await LogAtividadeSistema.create({ ID_UTILIZADOR: req.userId || 1, TIPO_ATIVIDADE: 'Ativação de Conta', DETALHES_ATIVIDADE: `Ativou a conta de ${u.NOME_COMPLETO_UTILIZADOR}`, DATA_HORA_ATIVIDADE: new Date() });
        res.json({ success: true, message: "Utilizador ativado com sucesso." });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// =========================================================
// GESTÃO DE REGISTOS PENDENTES
// =========================================================

// 6. Listar registos pendentes de aprovação
controllers.getPendentesRegisto = async (req, res) => {
    try {
        const users = await Utilizador.findAll({
            where: { ESTADO_CONTA_UTILIZADOR: 'Pendente' },
            order: [['DATA_REGISTO_UTILIZADOR', 'DESC']]
        });

        const listaFormatada = users.map(u => ({
            id: u.ID_UTILIZADOR,
            nome: u.NOME_COMPLETO_UTILIZADOR,
            email: u.EMAIL_UTILIZADOR,
            perfis: u.PERFIL_UTILIZADOR || 'Consultor',
            sl: u.SL_REGISTO || 'Global',
            area: u.AREA_REGISTO || 'N/A',
            data: new Date(u.DATA_REGISTO_UTILIZADOR).toISOString().split('T')[0]
        }));

        res.json({ success: true, data: listaFormatada });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// 7. Detalhes de um registo pendente
controllers.getDetalhesRegisto = async (req, res) => {
    try {
        const { id } = req.params;
        const u = await Utilizador.findByPk(id);
        
        if (!u) return res.status(404).json({ success: false, message: "Pedido não encontrado." });

        res.json({
            success: true,
            data: {
                id: u.ID_UTILIZADOR,
                nome: u.NOME_COMPLETO_UTILIZADOR,
                email: u.EMAIL_UTILIZADOR,
                perfis: u.PERFIL_UTILIZADOR || 'Consultor',
                data: new Date(u.DATA_REGISTO_UTILIZADOR).toLocaleDateString('pt-PT'),
                sl: u.SL_REGISTO || 'N/A',
                area: u.AREA_REGISTO || (u.PERFIL_UTILIZADOR && u.PERFIL_UTILIZADOR.includes('Consultor') ? 'LowCode' : 'N/A'),
                motivacao: u.MOTIVACAO_REGISTO || "Sem motivação fornecida pelo utilizador."
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// 8. Aceitar registo
controllers.aceitarRegisto = async (req, res) => {
    try {
        const { id } = req.params;
        const adminId = req.decoded ? req.decoded.id : 1;
        
        const util = await Utilizador.findByPk(id);
        if (!util) {
            return res.status(404).json({ success: false, message: "Utilizador não encontrado." });
        }

        // Atualiza estado para Ativo
        await Utilizador.update(
            { ESTADO_CONTA_UTILIZADOR: 'Ativo' },
            { where: { ID_UTILIZADOR: id } }
        );

        // Criar perfis/registos nas tabelas específicas com base no perfil solicitado
        const perfisString = util.PERFIL_UTILIZADOR || 'Consultor';
        const perfisList = perfisString.split(' / ').map(p => p.trim());

        // Obter Area se for consultor
        const Area = require('../models/Area');
        let idArea = null;
        if (util.AREA_REGISTO) {
            const areaObj = await Area.findOne({ where: { NOME_AREA: util.AREA_REGISTO } });
            if (areaObj) {
                idArea = areaObj.ID_AREA;
            }
        }

        if (perfisList.includes('Consultor')) {
            const consultorExiste = await Consultor.findOne({ where: { ID_UTILIZADOR: id } });
            if (!consultorExiste) {
                await Consultor.create({ 
                    ID_UTILIZADOR: id, 
                    DATA_ENTRADA_EMPRESA: new Date(), 
                    PONTUACAO_TOTAL: 0,
                    ID_AREA: idArea 
                });
            }
        }
        if (perfisList.includes('Talent Manager')) {
            const tmExiste = await TalentManager.findOne({ where: { ID_UTILIZADOR: id } });
            if (!tmExiste) {
                await TalentManager.create({ 
                    ID_UTILIZADOR: id, 
                    DATA_INICIO_FUNC: new Date() 
                });
            }
        }
        if (perfisList.includes('Service Line Leader')) {
            const sllExiste = await ServiceLineLeader.findOne({ where: { ID_UTILIZADOR: id } });
            if (!sllExiste) {
                const ServiceLine = require('../models/ServiceLine');
                let idSL = null;
                if (util.SL_REGISTO) {
                    const slObj = await ServiceLine.findOne({ where: { NOME_SERVICE_LINE: util.SL_REGISTO } });
                    if (slObj) {
                        idSL = slObj.ID_SERVICE_LINE;
                    }
                }
                await ServiceLineLeader.create({ 
                    ID_UTILIZADOR: id, 
                    ID_SERVICE_LINE: idSL,
                    CARGO_SLL: 'Líder de Área', 
                    DATA_INICIO_FUNCOES: new Date() 
                });
            }
        }
        if (perfisList.includes('Administrador')) {
            const adminExiste = await Administrador.findOne({ where: { ID_UTILIZADOR: id } });
            if (!adminExiste) {
                await Administrador.create({ 
                    ID_UTILIZADOR: id, 
                    DATA_REGISTO_PLATAFORMA: new Date() 
                });
            }
        }

        // Adicionar LogAtividadeSistema
        await LogAtividadeSistema.create({
            ID_UTILIZADOR: adminId,
            TIPO_ATIVIDADE: 'Aprovação de Conta',
            DETALHES_ATIVIDADE: `Aprovou o pedido de registo de ${util.NOME_COMPLETO_UTILIZADOR} (${perfisString}).`,
            DATA_HORA_ATIVIDADE: new Date()
        });

        // Enviar e-mail de aprovação
        try {
            mailer.sendEmail(
                util.EMAIL_UTILIZADOR,
                'Conta Aprovada - Plataforma de Badges Softinsa',
                `<h1>Olá, ${util.NOME_COMPLETO_UTILIZADOR}</h1><p>O seu pedido de registo foi <b>aprovado</b> pelo Administrador.</p><p>Já pode iniciar sessão na plataforma utilizando as suas credenciais.</p>`, 'contas', perfisString);
        } catch (mailErr) {
            console.error("Falha ao enviar email de aprovação.", mailErr);
        }

        // --- NOTIFICAR SLL E TM SE APLICÁVEL ---
        try {
            const Notificacao = require('../models/Notificacao');
            const { Op } = require('sequelize');

            // Encontrar Líderes e TMs para notificar
            if (util.SL_REGISTO && util.SL_REGISTO !== 'N/A') {
                const slls = await Utilizador.findAll({
                    where: { 
                        PERFIL_UTILIZADOR: { [Op.like]: '%Service Line Leader%' },
                        ESTADO_CONTA_UTILIZADOR: 'Ativo'
                    }
                });
                for (const sll of slls) {
                    pushService.sendPush(sll.ID_UTILIZADOR, 'system', 'Novo Consultor Adicionado', `Um novo consultor (${util.NOME_COMPLETO_UTILIZADOR}) da Service Line ${util.SL_REGISTO} foi aprovado na plataforma.`, 'contas', 'SLL');
                }
            }

            if (util.AREA_REGISTO && util.AREA_REGISTO !== 'N/A') {
                const tms = await Utilizador.findAll({
                    where: { 
                        PERFIL_UTILIZADOR: { [Op.like]: '%Talent Manager%' },
                        ESTADO_CONTA_UTILIZADOR: 'Ativo'
                    }
                });
                for (const tm of tms) {
                    pushService.sendPush(tm.ID_UTILIZADOR, 'system', 'Novo Consultor na Área', `O consultor ${util.NOME_COMPLETO_UTILIZADOR} ingressou na área ${util.AREA_REGISTO}. Acompanhe o seu progresso.`, 'contas', 'Talent Manager');
                }
            }

            // Notificar o próprio user na app
            pushService.sendPush(util.ID_UTILIZADOR, 'system', 'Bem-vindo à Gamificação Softinsa!', 'A sua conta foi validada com sucesso. Pode começar a candidatar-se a badges.', 'contas', 'Consultor');

        } catch (notifErr) {
            console.error("Erro ao notificar entrada de utilizador:", notifErr);
        }
        // ------------------------------------------

        res.json({ success: true, message: "Registo aceite com sucesso. O utilizador já pode fazer login." });
    } catch (error) {
        console.error("Erro ao aceitar registo:", error);
        res.status(500).json({ success: false, message: error.message });
    }
};

// 9. Recusar registo
controllers.recusarRegisto = async (req, res) => {
    try {
        const { id } = req.params;
        const adminId = req.decoded ? req.decoded.id : 1;
        
        const util = await Utilizador.findByPk(id);
        if (!util) {
            return res.status(404).json({ success: false, message: "Utilizador não encontrado." });
        }

        await Utilizador.update(
            { ESTADO_CONTA_UTILIZADOR: 'Recusado' },
            { where: { ID_UTILIZADOR: id } }
        );

        // Adicionar LogAtividadeSistema
        await LogAtividadeSistema.create({
            ID_UTILIZADOR: adminId,
            TIPO_ATIVIDADE: 'Aprovação de Conta',
            DETALHES_ATIVIDADE: `Recusou o pedido de registo de ${util.NOME_COMPLETO_UTILIZADOR}.`,
            DATA_HORA_ATIVIDADE: new Date()
        });

        try {
            mailer.sendEmail(
                util.EMAIL_UTILIZADOR,
                'Conta Recusada - Plataforma de Badges Softinsa',
                `<h1>Olá, ${util.NOME_COMPLETO_UTILIZADOR}</h1><p>Lamentamos informar que o seu pedido de registo foi <b>recusado</b> pelo Administrador.</p><p>Se achar que se trata de um erro, por favor contacte a equipa administrativa diretamente.</p>`, 'contas', util.PERFIL_UTILIZADOR);
        } catch (mailErr) {
            console.error("Falha ao enviar email de recusa.", mailErr);
        }

        res.json({ success: true, message: "Registo recusado." });
    } catch (error) {
        console.error("Erro ao recusar registo:", error);
        res.status(500).json({ success: false, message: error.message });
    }
};

// =========================================================
// LOGS DE ATIVIDADE DO SISTEMA
// =========================================================

// 10. Listar todos os logs de atividade do sistema
controllers.getLogAtividades = async (req, res) => {
    try {
        let logs = await LogAtividadeSistema.findAll({
            include: [{ model: Utilizador }],
            order: [['DATA_HORA_ATIVIDADE', 'DESC']]
        });

                const dadosFormatados = logs.map(log => {
            let perfilEspecifico = log.Utilizador ? log.Utilizador.PERFIL_UTILIZADOR : 'N/A';
            
            // Deduz o perfil responsável pela ação para permitir filtros fiáveis.
            const tipo = log.TIPO_ATIVIDADE || '';
            if (/(Criação|Eliminação|Atualização|Ativação|Desativação|Aprovação de Conta|Rejeição de Conta|Configuração)/.test(tipo)) {
                perfilEspecifico = 'Administrador';
            } else if (/TM|Talent Manager/.test(tipo)) {
                perfilEspecifico = 'Talent Manager';
            } else if (/SLL/.test(tipo)) {
                perfilEspecifico = 'Service Line Leader';
            } else if (/(Candidatura|Evidências|Badge Obtido|Badge Premium Obtido)/.test(tipo)) {
                perfilEspecifico = 'Consultor';
            }

            return {
                id: log.ID_LOG_ATIVIDADE,
                nome: log.Utilizador ? log.Utilizador.NOME_COMPLETO_UTILIZADOR : 'Desconhecido',
                perfil: perfilEspecifico,
                sl: (log.Utilizador && log.Utilizador.SL_REGISTO) ? log.Utilizador.SL_REGISTO : 'Global',
                data: log.DATA_HORA_ATIVIDADE,
                detalhes: log.DETALHES_ATIVIDADE,
                acao: log.TIPO_ATIVIDADE
            };
        });

        res.json({ success: true, data: dadosFormatados });
    } catch (error) {
        console.error("ERRO LISTA LOGS:", error);
        res.status(500).json({ success: false, message: error.message });
    }
};

module.exports = controllers;




