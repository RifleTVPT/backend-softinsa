const nodemailer = require('nodemailer');
require('dotenv').config();
const ConfiguracoesSistema = require('../models/ConfiguracoesSistema');
const perfisNormalizados = (perfilStr) => String(perfilStr || '')
    .split(' / ')
    .map(perfil => perfil.trim() === 'Service Line Leader' ? 'SLL' : perfil.trim())
    .filter(Boolean);

const canalPermitido = (matriz, eventoId, perfilStr, canal) => {
    const perfis = perfisNormalizados(perfilStr);
    if (perfis.length === 0 || !matriz[eventoId]) return true;
    return perfis.some(perfil => matriz[eventoId]?.[perfil]?.[canal] !== false);
};


// Create a reusable transporter object using SMTP transport
// In development, you can use Ethereal (https://ethereal.email/)
const createTransporter = async (config) => {
    let host = config?.SMTP_HOST || process.env.SMTP_HOST;
    let port = config?.SMTP_PORT || process.env.SMTP_PORT || 587;
    let secure = config?.SMTP_SECURE ?? (process.env.SMTP_SECURE === 'true');
    let user = config?.SMTP_USER || process.env.SMTP_USER;
    let pass = config?.SMTP_PASS || process.env.SMTP_PASS;

    if (!host || !user) {
        let testAccount = await nodemailer.createTestAccount();
        host = "smtp.ethereal.email";
        port = 587;
        secure = false;
        user = testAccount.user;
        pass = testAccount.pass;
    }

    return nodemailer.createTransport({
        host,
        port,
        secure,
        auth: { user, pass }
    });
};

const testSmtp = async (smtpConfig, destinatario) => {
    const host = String(smtpConfig.SMTP_HOST || '').trim();
    const port = Number(smtpConfig.SMTP_PORT || 587);
    const user = String(smtpConfig.SMTP_USER || '').trim();
    const pass = String(smtpConfig.SMTP_PASS || '');
    const secure = smtpConfig.SMTP_SECURE === true;
    if (!host || !user || !pass) {
        throw new Error('Preencha o servidor SMTP, o utilizador e a password antes de testar.');
    }
    const transporter = nodemailer.createTransport({
        host,
        port,
        secure,
        auth: { user, pass }
    });
    await transporter.verify();
    return transporter.sendMail({
        from: `"Plataforma de Badges Softinsa" <${user}>`,
        to: destinatario,
        subject: 'Teste SMTP - Plataforma de Badges Softinsa',
        html: '<h2>Configuração SMTP válida</h2><p>Este email confirma que a Plataforma de Badges Softinsa consegue enviar mensagens com as credenciais configuradas.</p>'
    });
};

let transporterInstance = null;

const getTransporter = async (config) => {
    // Retornamos sempre uma nova instância para caso as configurações tenham mudado na bd
    return await createTransporter(config);
};

/**
 * Sends an email
 * @param {string} to - Recipient email
 * @param {string} subject - Email subject
 * @param {string} html - HTML body content
 * @param {string} eventoId - Optional. ID of the event (e.g. 'pedidos', 'badges')
 * @param {string} perfilStr - Optional. Role of recipient (e.g. 'Consultor', 'Talent Manager')
 */
const sendEmail = async (to, subject, html, eventoId = null, perfilStr = null) => {
    try {
        const config = await ConfiguracoesSistema.findByPk(1);
        
        // Validação Global
        if (config && config.GLOBAL_EMAIL === false) {
            console.log(`Email cancelado: Envio global de emails está inativo. (Para: ${to})`);
            return null;
        }

        // Validação por Matriz
        if (config && config.MATRIZ_NOTIFICACOES && eventoId && perfilStr) {
            try {
                const matriz = JSON.parse(config.MATRIZ_NOTIFICACOES);
                if (!canalPermitido(matriz, eventoId, perfilStr, 'email')) return null;
            } catch (error) {
                console.error('Matriz de notificações inválida:', error);
            }
        }

        const transporter = await getTransporter(config);
        const info = await transporter.sendMail({
            from: `"Plataforma de Badges Softinsa" <${config?.SMTP_USER || process.env.SMTP_USER || 'no-reply@softinsa.pt'}>`,
            to,
            subject,
            html,
        });

        console.log("Message sent: %s", info.messageId);
        if (info.messageId && info.messageId.includes('ethereal')) {
            console.log("Preview URL: %s", nodemailer.getTestMessageUrl(info));
        }
        return info;
    } catch (error) {
        console.error("Erro ao enviar email:", error);
        throw error;
    }
};

module.exports = {
    sendEmail,
    testSmtp
};
