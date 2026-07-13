const Utilizador = require('../models/Utilizador');
const Consultor = require('../models/Consultor');
const PreferenciasUtilizador = require('../models/PreferenciasUtilizador');
const EstatisticasAcesso = require('../models/EstatisticasAcesso');
const Area = require('../models/Area');
const bcrypt = require('bcryptjs');
const pushService = require('../services/pushService');
const jwt = require('jsonwebtoken');
const config = require('../config');
const mailer = require('../config/mailer');
const { obterServiceLineSLL } = require('../utils/sllServiceLineHelper');
const { uploadMulterFile } = require('../services/cloudFileService');
const LogAtividadeSistema = require('../models/LogAtividadeSistema');
const Notificacao = require('../models/Notificacao');
const { Op } = require('sequelize');

const controllers = {};
const passwordForte = password => /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^a-zA-Z\d]).{8,}$/.test(String(password || ''));

const enviarAvisoConta = async (user, titulo, mensagemHtml, mensagemPush = null) => {
    try {
        await mailer.sendEmail(user.EMAIL_UTILIZADOR, titulo, mensagemHtml, 'contas', user.PERFIL_UTILIZADOR);
    } catch (mailErr) {
        console.error(`Aviso: falha ao enviar email "${titulo}".`, mailErr);
    }
    if (mensagemPush) {
        try {
            await pushService.sendPush(user.ID_UTILIZADOR, 'system', titulo, mensagemPush, 'contas', user.PERFIL_UTILIZADOR);
        } catch (pushErr) {
            console.error(`Aviso: falha ao enviar notificação "${titulo}".`, pushErr);
        }
    }
};

const registarLogConta = async (idUtilizador, tipo, detalhes) => {
    try {
        await LogAtividadeSistema.create({
            ID_UTILIZADOR: idUtilizador,
            TIPO_ATIVIDADE: tipo,
            DETALHES_ATIVIDADE: detalhes,
            DATA_HORA_ATIVIDADE: new Date()
        });
    } catch (logErr) {
        console.error(`Aviso: falha ao registar log "${tipo}".`, logErr);
    }
};

controllers.register = async (req, res) => {
    try {
        const { nome, email, password, perfil, motivacao, slRegisto, areaRegisto } = req.body;
        if (!passwordForte(password)) {
            return res.status(400).json({ success: false, message: "A password deve ter 8+ caracteres, uma maiúscula, uma minúscula, um número e um caractere especial." });
        }
        const emailExiste = await Utilizador.findOne({ where: { EMAIL_UTILIZADOR: email } });
        if (emailExiste) {
            if (emailExiste.ESTADO_CONTA_UTILIZADOR !== 'Recusado') {
                return res.status(400).json({ success: false, message: 'Este email já se encontra registado.' });
            }

            await emailExiste.update({
                NOME_COMPLETO_UTILIZADOR: nome,
                PASSWORD_UTILIZADOR: password,
                PERFIL_UTILIZADOR: perfil,
                ESTADO_CONTA_UTILIZADOR: 'Pendente',
                DATA_REGISTO_UTILIZADOR: new Date(),
                IS_PRIMEIRO_ACESSO: true,
                MOTIVACAO_REGISTO: motivacao || null,
                SL_REGISTO: slRegisto || null,
                AREA_REGISTO: areaRegisto || null,
                FCM_TOKEN: null
            });

            try {
                await PreferenciasUtilizador.findOrCreate({
                    where: { ID_UTILIZADOR: emailExiste.ID_UTILIZADOR },
                    defaults: {
                        ID_UTILIZADOR: emailExiste.ID_UTILIZADOR,
                        IDIOMA_APP: 'pt',
                        RECEBER_EMAIL_PEDIDOS: true,
                        RECEBER_PUSH_EXPIRACAO: true,
                        EXIBIR_LINK_PUBLICO: true,
                        TERMOS_RGPD: true
                    }
                });
            } catch (prefErr) {
                console.error("Aviso: Falha ao garantir preferências no novo pedido de registo.", prefErr);
            }

            await LogAtividadeSistema.create({
                ID_UTILIZADOR: emailExiste.ID_UTILIZADOR,
                TIPO_ATIVIDADE: 'Novo Pedido de Registo',
                DETALHES_ATIVIDADE: `Utilizador com registo recusado submeteu novo pedido como ${perfil}.`,
                DATA_HORA_ATIVIDADE: new Date()
            }).catch(() => {});

            try {
                const admins = await Utilizador.findAll({
                    where: {
                        PERFIL_UTILIZADOR: { [Op.like]: '%Administrador%' },
                        ESTADO_CONTA_UTILIZADOR: 'Ativo'
                    }
                });
                for (const admin of admins) {
                    await Notificacao.create({
                        ID_UTILIZADOR: admin.ID_UTILIZADOR,
                        TITULO_NOTIFICACAO: 'Novo Pedido de Registo',
                        MENSAGEM_NOTIFICACAO: `${nome} voltou a submeter um pedido de registo com o email ${email}.`,
                        TIPO_NOTIFICACAO: 'contas'
                    });
                }
            } catch (notifErr) {
                console.error("Aviso: Falha ao gerar notificações para admins no novo pedido de registo.", notifErr);
            }

            try {
                mailer.sendEmail(
                    email,
                    'Pedido de Registo Reenviado - Plataforma de Badges Softinsa',
                    `<h1>Olá, ${nome}</h1><p>O seu novo pedido de registo como <b>${perfil}</b> foi recebido com sucesso.</p><p>A sua conta encontra-se novamente pendente de aprovação pela equipa administrativa.</p>`,
                    'contas',
                    perfil
                );
            } catch (mailErr) {
                console.error("Aviso: Falha ao enviar email de novo pedido de registo.", mailErr);
            }

            return res.status(201).json({ success: true, message: "Registo submetido com sucesso! A aguardar aprovação da administração.", data: emailExiste });
        }
        const novoUser = await Utilizador.create({
            NOME_COMPLETO_UTILIZADOR: nome,
            EMAIL_UTILIZADOR: email,
            PASSWORD_UTILIZADOR: password, 
            PERFIL_UTILIZADOR: perfil,
            ESTADO_CONTA_UTILIZADOR: 'Pendente',
            MOTIVACAO_REGISTO: motivacao || null,
            SL_REGISTO: slRegisto || null,
            AREA_REGISTO: areaRegisto || null
        });

        // Procurar todos os administradores para os notificar
        try {
            const admins = await Utilizador.findAll({
                where: {
                    PERFIL_UTILIZADOR: {
                        [Op.like]: '%Administrador%'
                    }
                }
            });
            for (const admin of admins) {
                pushService.sendPush(admin.ID_UTILIZADOR, 'system', 'Novo Registo Pendente', `O utilizador ${nome} registou-se como ${perfil} e aguarda aprovação.`, 'contas', admin.PERFIL_UTILIZADOR);
                try {
                    await mailer.sendEmail(
                        admin.EMAIL_UTILIZADOR,
                        'Novo Registo Pendente - Plataforma de Badges Softinsa',
                        `<h2>Novo registo pendente</h2><p>O utilizador <b>${nome}</b> registou-se como <b>${perfil}</b> e aguarda aprovação.</p><p>Aceda à área de Administração para validar ou recusar o pedido.</p>`,
                        'contas',
                        admin.PERFIL_UTILIZADOR
                    );
                } catch (mailErr) {
                    console.error("Aviso: Falha ao enviar email para admin no registo.", mailErr);
                }
            }
        } catch (notifErr) {
            console.error("Aviso: Falha ao gerar notificações para admins no registo.", notifErr);
        }

        // Tentar enviar e-mail de boas-vindas/confirmação
        try {
            mailer.sendEmail(
                email,
                'Bem-vindo à Plataforma de Badges Softinsa',
                `<h1>Olá, ${nome}</h1><p>O seu registo como <b>${perfil}</b> foi recebido com sucesso.</p><p>A sua conta encontra-se atualmente pendente de aprovação pela equipa administrativa. Receberá um e-mail assim que a sua conta for ativada.</p>`, 'contas', perfil);
        } catch (mailErr) {
            console.error("Aviso: Falha ao enviar email de registo.", mailErr);
        }

        res.status(201).json({ success: true, message: "Registo submetido com sucesso! A aguardar aprovação da administração.", data: novoUser });
    } catch (error) {
        let msg = error.message;
        if (error.name === 'SequelizeUniqueConstraintError') {
            msg = "Este email já se encontra registado no sistema.";
        }
        res.status(500).json({ success: false, message: msg, details: error.errors?.map(e => e.message) });
    }
};

controllers.login = async (req, res) => {
    try {
        const { email, password } = req.body;
        const user = await Utilizador.findOne({ where: { EMAIL_UTILIZADOR: email } });

        if (!user || !bcrypt.compareSync(password, user.PASSWORD_UTILIZADOR)) {
            return res.status(401).json({ success: false, message: "Dados de autenticação inválidos." });
        }

        // Só contas ativas podem autenticar. Contas pendentes, recusadas ou inativas
        // não devem gerar token nem contar como acesso.
        if (user.ESTADO_CONTA_UTILIZADOR === 'Pendente') {
            return res.status(403).json({ success: false, message: "A sua conta ainda se encontra a aguardar aprovação por um Administrador." });
        }
        if (user.ESTADO_CONTA_UTILIZADOR === 'Recusado') {
            return res.status(401).json({ success: false, message: "Dados de autenticação inválidos." });
        }
        if (user.ESTADO_CONTA_UTILIZADOR === 'Inativo') {
            return res.status(403).json({ success: false, message: "A sua conta encontra-se desativada." });
        }
        if (user.ESTADO_CONTA_UTILIZADOR !== 'Ativo') {
            return res.status(401).json({ success: false, message: "Dados de autenticação inválidos." });
        }
        
        // Gerar o JWT Token com validade de 1 hora
        const token = jwt.sign({ 
            id: user.ID_UTILIZADOR, 
            email: user.EMAIL_UTILIZADOR, 
            role: user.PERFIL_UTILIZADOR 
        }, config.jwtSecret, { expiresIn: '1h' });

        // Registar acesso em EstatisticasAcesso
        try {
            // Tentar descobrir a SL. Assumir 1 (Global) se não for consultor
            let idSL = 1; 
            const consultor = await Consultor.findOne({ where: { ID_UTILIZADOR: user.ID_UTILIZADOR } });
            if (consultor && consultor.ID_AREA) {
                const area = await Area.findByPk(consultor.ID_AREA);
                if (area) idSL = area.ID_SERVICE_LINE;
            } else {
                const sll = await require('../models/ServiceLineLeader').findOne({ where: { ID_UTILIZADOR: user.ID_UTILIZADOR } });
                if (sll && sll.ID_SERVICE_LINE) idSL = sll.ID_SERVICE_LINE;
            }

            const dataHoje = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
            const [estatistica, created] = await EstatisticasAcesso.findOrCreate({
                where: { DATA_REFERENCIA: dataHoje, ID_SERVICE_LINE: idSL },
                defaults: { TOTAL_ACESSOS_DIA: 1 }
            });
            if (!created) {
                await estatistica.increment('TOTAL_ACESSOS_DIA', { by: 1 });
            }
        } catch (errAcesso) {
            console.error("Erro ao registar estatística de acesso: ", errAcesso);
        }

        const serviceLineSLL = await obterServiceLineSLL(user.ID_UTILIZADOR, user.SL_REGISTO);
        const userResposta = {
            ...user.toJSON(),
            ...(serviceLineSLL ? {
                SL_REGISTO: user.SL_REGISTO || serviceLineSLL,
                SERVICE_LINE: serviceLineSLL
            } : {})
        };

        res.json({ 
            success: true, 
            message: "Autenticação realizada com sucesso!", 
            token: token, 
            user: userResposta,
            firstAccess: user.IS_PRIMEIRO_ACESSO
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

controllers.getConfiguracoes = async (req, res) => {
    try {
        const { idUtilizador } = req.params;
        
        const util = await Utilizador.findByPk(idUtilizador);
        if (!util) return res.status(404).json({ success: false, message: "Utilizador não encontrado." });

        let serviceLineNome = await obterServiceLineSLL(idUtilizador, util.SL_REGISTO) || 'Indefinida';
        let areaNome = util.AREA_REGISTO || 'Indefinida';
        
        if (util.PERFIL_UTILIZADOR === 'Consultor') {
            const consultor = await Consultor.findOne({ where: { ID_UTILIZADOR: idUtilizador } });
            // Caso existissem IDs relacionais diretos na tabela Consultor, faríamos query aqui.
            // Por agora, assumimos os registados no Utilizador na fase de Registo.
        }

        let pref = await PreferenciasUtilizador.findOne({ where: { ID_UTILIZADOR: idUtilizador } });
        if (!pref) {
            pref = await PreferenciasUtilizador.create({
                ID_UTILIZADOR: idUtilizador,
                IDIOMA_APP: 'Português',
                RECEBER_EMAIL_PEDIDOS: true,
                RECEBER_PUSH_EXPIRACAO: true,
                EXIBIR_LINK_PUBLICO: true,
                TERMOS_RGPD: false
            });
        }

        res.json({
            success: true,
            data: {
                nome: util.NOME_COMPLETO_UTILIZADOR,
                email: util.EMAIL_UTILIZADOR,
                avatar: util.URL_FOTO, // <--- O React agora já recebe o URL da foto!
                serviceLine: serviceLineNome,
                area: areaNome,
                idioma: pref.IDIOMA_APP,
                receberAprovacoes: pref.RECEBER_EMAIL_PEDIDOS,
                receberExpiracao: pref.RECEBER_PUSH_EXPIRACAO,
                partilharLinkedIn: pref.EXIBIR_LINK_PUBLICO,
                termosRgpd: pref.TERMOS_RGPD,
                receberEmailNotif: true
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

controllers.updateConfiguracoes = async (req, res) => {
    try {
        const { idUtilizador } = req.params;
        const { nome, email, idioma, receberAprovacoes, receberExpiracao, partilharLinkedIn, termosRgpd } = req.body;

        const user = await Utilizador.findByPk(idUtilizador);
        if (!user) return res.status(404).json({ success: false, message: "Utilizador não encontrado." });

        const camposAtualizar = {};
        if (nome !== undefined) camposAtualizar.NOME_COMPLETO_UTILIZADOR = nome;
        if (email !== undefined) {
            const emailLimpo = String(email).trim().toLowerCase();
            if (!emailLimpo) {
                return res.status(400).json({ success: false, message: "O email não pode ficar vazio." });
            }
            const emailEmUso = await Utilizador.findOne({
                where: {
                    EMAIL_UTILIZADOR: emailLimpo,
                    ID_UTILIZADOR: { [Op.ne]: idUtilizador }
                }
            });
            if (emailEmUso) {
                return res.status(400).json({ success: false, message: "Este email já se encontra registado." });
            }
            camposAtualizar.EMAIL_UTILIZADOR = emailLimpo;
        }

        if (Object.keys(camposAtualizar).length > 0) {
            await Utilizador.update(
                camposAtualizar,
                { where: { ID_UTILIZADOR: idUtilizador } }
            );
        }

        const preferenciasAtualizar = {};
        if (idioma !== undefined) preferenciasAtualizar.IDIOMA_APP = idioma;
        if (receberAprovacoes !== undefined) preferenciasAtualizar.RECEBER_EMAIL_PEDIDOS = receberAprovacoes;
        if (receberExpiracao !== undefined) preferenciasAtualizar.RECEBER_PUSH_EXPIRACAO = receberExpiracao;
        if (partilharLinkedIn !== undefined) preferenciasAtualizar.EXIBIR_LINK_PUBLICO = partilharLinkedIn;
        if (termosRgpd !== undefined) preferenciasAtualizar.TERMOS_RGPD = termosRgpd;

        if (Object.keys(preferenciasAtualizar).length > 0) {
            const [pref] = await PreferenciasUtilizador.findOrCreate({
                where: { ID_UTILIZADOR: idUtilizador },
                defaults: {
                    IDIOMA_APP: 'Português',
                    RECEBER_EMAIL_PEDIDOS: true,
                    RECEBER_PUSH_EXPIRACAO: true,
                    EXIBIR_LINK_PUBLICO: true,
                    TERMOS_RGPD: false
                }
            });
            await pref.update(preferenciasAtualizar);
        }

        const atualizado = await Utilizador.findByPk(idUtilizador);

        if (camposAtualizar.NOME_COMPLETO_UTILIZADOR && camposAtualizar.NOME_COMPLETO_UTILIZADOR !== user.NOME_COMPLETO_UTILIZADOR) {
            await enviarAvisoConta(
                atualizado,
                'Nome de Conta Atualizado',
                `<h1>Olá, ${atualizado.NOME_COMPLETO_UTILIZADOR}</h1><p>O nome associado à sua conta foi atualizado com sucesso.</p><p>Se não reconhece esta alteração, contacte a administração da plataforma.</p>`,
                'O nome associado à sua conta foi atualizado com sucesso.'
            );
            await registarLogConta(atualizado.ID_UTILIZADOR, 'Alteração de Nome', `Alterou o nome da conta para ${atualizado.NOME_COMPLETO_UTILIZADOR}`);
        }

        if (camposAtualizar.EMAIL_UTILIZADOR && camposAtualizar.EMAIL_UTILIZADOR !== user.EMAIL_UTILIZADOR) {
            await enviarAvisoConta(
                atualizado,
                'Email de Conta Atualizado',
                `<h1>Olá, ${atualizado.NOME_COMPLETO_UTILIZADOR}</h1><p>O email associado à sua conta foi atualizado para <b>${atualizado.EMAIL_UTILIZADOR}</b>.</p><p>Use este endereço no próximo início de sessão.</p>`,
                `O email associado à sua conta foi atualizado para ${atualizado.EMAIL_UTILIZADOR}.`
            );
            await registarLogConta(atualizado.ID_UTILIZADOR, 'Alteração de Email', `Alterou o email da conta de ${user.EMAIL_UTILIZADOR} para ${atualizado.EMAIL_UTILIZADOR}`);
        }

        res.json({
            success: true,
            message: "Configurações guardadas com sucesso!",
            data: {
                nome: atualizado.NOME_COMPLETO_UTILIZADOR,
                email: atualizado.EMAIL_UTILIZADOR,
                avatar: atualizado.URL_FOTO
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

controllers.mudarPassword = async (req, res) => {
    try {
        const { idUtilizador } = req.params;
        const { passwordAtual, novaPassword } = req.body;

        const user = await Utilizador.findByPk(idUtilizador);
        if (!user) return res.status(404).json({ success: false, message: "Utilizador não encontrado." });
        if (!passwordForte(novaPassword)) {
            return res.status(400).json({ success: false, message: "A password deve ter 8+ caracteres, uma maiúscula, uma minúscula, um número e um caractere especial." });
        }

        if (user.IS_PRIMEIRO_ACESSO && passwordAtual === 'PRIMEIRO_ACESSO_OVERRIDE') {
            // Bypass para o primeiro acesso onde o user não tem a password atual guardada no frontend
        } else if (!bcrypt.compareSync(passwordAtual, user.PASSWORD_UTILIZADOR)) {
            return res.status(400).json({ success: false, message: "A password atual que introduziu está incorreta." });
        }

        // O beforeUpdate no Utilizador.js tratará do hash da nova password
        await Utilizador.update(
            { PASSWORD_UTILIZADOR: novaPassword, IS_PRIMEIRO_ACESSO: false },
            { where: { ID_UTILIZADOR: idUtilizador }, individualHooks: true }
        );

        await enviarAvisoConta(
            user,
            'Password Alterada',
            `<h1>Olá, ${user.NOME_COMPLETO_UTILIZADOR}</h1><p>A password da sua conta foi alterada com sucesso.</p><p>Se não reconhece esta alteração, contacte a administração da plataforma.</p>`,
            'A password da sua conta foi alterada com sucesso.'
        );
        await registarLogConta(user.ID_UTILIZADOR, 'Alteração de Password', 'Alterou a password da conta.');

        res.json({ success: true, message: "Password alterada com sucesso!" });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// --- MÀ°TODO DO MULTER CORRIGIDO ---
controllers.uploadAvatar = async (req, res) => {
    try {
        const { idUtilizador } = req.params;
        
        if (!req.file) {
            return res.status(400).json({ success: false, message: "Nenhum ficheiro enviado." });
        }
        const uploadedAvatar = await uploadMulterFile(req, req.file, {
            folder: 'softinsa/avatars',
            resourceType: 'auto',
            absoluteLocalUrl: true
        });
        const fileUrl = uploadedAvatar.url;
        console.log('[Avatar] Foto guardada no Cloudinary/local:', fileUrl);

        await Utilizador.update(
            { URL_FOTO: fileUrl },
            { where: { ID_UTILIZADOR: idUtilizador } }
        );

        const user = await Utilizador.findByPk(idUtilizador);
        if (user) {
            await registarLogConta(user.ID_UTILIZADOR, 'Alteração de Foto de Perfil', 'Alterou a foto de perfil da conta.');
        }

        res.json({ success: true, message: "Foto atualizada!", avatarUrl: fileUrl, data: { avatar: fileUrl } });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

controllers.verificarEmailRecuperacao = async (req, res) => {
    try {
        const { email } = req.body;
        const util = await Utilizador.findOne({ where: { EMAIL_UTILIZADOR: email } });
        if (!util || util.ESTADO_CONTA_UTILIZADOR === 'Recusado') {
            return res.status(404).json({ success: false, message: 'Email não associado a um utilizador registado.' });
        }
        if (util.ESTADO_CONTA_UTILIZADOR !== 'Ativo') {
            return res.status(400).json({
                success: false,
                message: util.ESTADO_CONTA_UTILIZADOR === 'Inativo'
                    ? 'A sua conta encontra-se desativada.'
                    : 'A sua conta ainda aguarda aprovação por um Administrador.'
            });
        }
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

controllers.recuperarPassword = async (req, res) => {
    try {
        const { email, novaPassword, confirmarPassword } = req.body;
        if (!email || !novaPassword || !confirmarPassword) return res.status(400).json({ success: false, message: 'Campos em falta.' });
        if (novaPassword !== confirmarPassword) return res.status(400).json({ success: false, message: 'As passwords não coincidem.' });
        if (!passwordForte(novaPassword)) return res.status(400).json({ success: false, message: "A password deve ter 8+ caracteres, uma maiúscula, uma minúscula, um número e um caractere especial." });
        
        const util = await Utilizador.findOne({ where: { EMAIL_UTILIZADOR: email } });
        if (!util || util.ESTADO_CONTA_UTILIZADOR === 'Recusado') {
            return res.status(404).json({ success: false, message: "Email não associado a um utilizador registado." });
        }

        if (util.ESTADO_CONTA_UTILIZADOR !== 'Ativo') {
            return res.status(400).json({
                success: false,
                message: util.ESTADO_CONTA_UTILIZADOR === 'Inativo'
                    ? 'A sua conta encontra-se desativada.'
                    : "A sua conta ainda se encontra a aguardar aprovação por um Administrador."
            });
        }

        const passHash = bcrypt.hashSync(novaPassword, 10);
        await Utilizador.update(
            { PASSWORD_UTILIZADOR: passHash },
            { where: { EMAIL_UTILIZADOR: email } }
        );

        await enviarAvisoConta(
            util,
            'Password redefinida com sucesso',
            `<h1>Olá, ${util.NOME_COMPLETO_UTILIZADOR}</h1>
             <p>A sua password foi redefinida com sucesso através do processo de recuperação.</p>
             <p>Se não foi o autor desta alteração, contacte a administração da Plataforma de Badges Softinsa.</p>`
        );
        await registarLogConta(util.ID_UTILIZADOR, 'Recuperação de Password', 'Redefiniu a password através do processo de recuperação.');

        res.json({ success: true, message: "Password redefinida com sucesso." });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

controllers.registarFcmToken = async (req, res) => {
    try {
        const { token } = req.body;
        if (!token || typeof token !== 'string') {
            return res.status(400).json({ success: false, message: 'Token FCM inválido.' });
        }
        await Utilizador.update(
            { FCM_TOKEN: token },
            { where: { ID_UTILIZADOR: req.userId } }
        );
        res.json({ success: true, message: 'Dispositivo registado para notificações push.' });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

module.exports = controllers;

