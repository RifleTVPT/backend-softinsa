const ConfiguracoesSistema = require('../models/ConfiguracoesSistema');
const Utilizador = require('../models/Utilizador');
const mailer = require('../config/mailer');

const controllers = {};

controllers.getConfiguracoes = async (req, res) => {
    try {
        let config = await ConfiguracoesSistema.findByPk(1);
        if (!config) {
            // Se não existir, cria o registo base com os valores default
            config = await ConfiguracoesSistema.create({ ID_CONFIG: 1 });
        }
        const data = config.toJSON();
        const perfis = String(req.userRole || '').split('/').map(p => p.trim());
        if (!perfis.includes('Administrador')) {
            delete data.SMTP_HOST;
            delete data.SMTP_PORT;
            delete data.SMTP_USER;
            delete data.SMTP_PASS;
            delete data.SMTP_SECURE;
            delete data.MATRIZ_NOTIFICACOES;
        }
        res.json({ success: true, data });
    } catch (error) {
        console.error("ERRO GET CONFIGURAÇÕES:", error);
        res.status(500).json({ success: false, message: error.message });
    }
};

controllers.getRGPD = async (req, res) => {
    try {
        let config = await ConfiguracoesSistema.findByPk(1);
        if (!config) {
            config = await ConfiguracoesSistema.create({ ID_CONFIG: 1 });
        }
        res.json({ success: true, data: { RGPD_TERMOS: config.RGPD_TERMOS, RGPD_POLITICAS: config.RGPD_POLITICAS } });
    } catch (error) {
        console.error("ERRO GET RGPD:", error);
        res.status(500).json({ success: false, message: error.message });
    }
};

controllers.updateConfiguracoes = async (req, res) => {
    try {
        const camposPermitidos = [
            'MODO_MANUTENCAO', 'PONTOS_DEFAULT_A', 'PONTOS_DEFAULT_B',
            'PONTOS_DEFAULT_C', 'PONTOS_DEFAULT_D', 'PONTOS_DEFAULT_E',
            'PONTOS_DEFAULT_OUTRO', 'VALIDADE_MESES_PADRAO', 'IDIOMA_PADRAO',
            'SESSAO_EXPIRACAO', 'RETENCAO_EVIDENCIAS', 'GLOBAL_EMAIL',
            'GLOBAL_PUSH', 'MATRIZ_NOTIFICACOES', 'SMTP_HOST', 'SMTP_PORT',
            'SMTP_USER', 'SMTP_PASS', 'SMTP_SECURE', 'RGPD_TERMOS',
            'RGPD_POLITICAS', 'RGPD_CONSENTIMENTOS'
        ];
        const payload = Object.fromEntries(
            Object.entries(req.body).filter(([campo]) => camposPermitidos.includes(campo))
        );
        if (payload.MATRIZ_NOTIFICACOES) {
            JSON.parse(payload.MATRIZ_NOTIFICACOES);
        }
        let config = await ConfiguracoesSistema.findByPk(1);

        if (!config) {
            config = await ConfiguracoesSistema.create({ ID_CONFIG: 1, ...payload });
        } else {
            await config.update(payload);
        }

        res.json({ success: true, data: config, message: "Configurações atualizadas com sucesso." });
    } catch (error) {
        console.error("ERRO UPDATE CONFIGURAÇÕES:", error);
        res.status(500).json({ success: false, message: error.message });
    }
};

controllers.testarEmail = async (req, res) => {
    try {
        const utilizador = await Utilizador.findByPk(req.userId);
        if (!utilizador?.EMAIL_UTILIZADOR) {
            return res.status(404).json({ success: false, message: 'Email do administrador não encontrado.' });
        }
        await mailer.testSmtp(req.body, utilizador.EMAIL_UTILIZADOR);
        res.json({
            success: true,
            message: `Ligação SMTP validada. Foi enviado um email de teste para ${utilizador.EMAIL_UTILIZADOR}.`
        });
    } catch (error) {
        res.status(400).json({ success: false, message: error.message });
    }
};

module.exports = controllers;
