const nodemailer = require('nodemailer');
const dns = require('node:dns');
require('dotenv').config();
const ConfiguracoesSistema = require('../models/ConfiguracoesSistema');

// Forçar resolução IPv4 primeiro, para evitar erros ENETUNREACH em ambientes (como Render) sem suporte a IPv6
if (dns.setDefaultResultOrder) {
    dns.setDefaultResultOrder('ipv4first');
}

const perfisNormalizados = (perfilStr) => String(perfilStr || '')
    .split(' / ')
    .map(perfil => perfil.trim() === 'Service Line Leader' ? 'SLL' : perfil.trim())
    .filter(Boolean);

const canalPermitido = (matriz, eventoId, perfilStr, canal) => {
    const perfis = perfisNormalizados(perfilStr);
    if (perfis.length === 0 || !matriz[eventoId]) return true;
    return perfis.some(perfil => matriz[eventoId]?.[perfil]?.[canal] !== false);
};

const usarBrevo = () => Boolean(process.env.BREVO_API_KEY);

const remetentePadrao = (config = {}) => {
    const email = process.env.EMAIL_FROM || config?.SMTP_USER || process.env.SMTP_USER || 'no-reply@softinsa.pt';
    const name = process.env.EMAIL_FROM_NAME || 'Plataforma de Badges Softinsa';
    return { email, name };
};

const enviarPorBrevo = async ({ to, subject, html, config }) => {
    const sender = remetentePadrao(config);
    const response = await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: {
            'accept': 'application/json',
            'api-key': process.env.BREVO_API_KEY,
            'content-type': 'application/json'
        },
        body: JSON.stringify({
            sender,
            to: [{ email: to }],
            subject,
            htmlContent: html
        })
    });

    const text = await response.text();
    let data = {};
    try {
        data = text ? JSON.parse(text) : {};
    } catch (_) {
        data = { raw: text };
    }

    if (!response.ok) {
        const detalhe = data.message || data.code || text || response.statusText;
        throw new Error(`Brevo API falhou (${response.status}): ${detalhe}`);
    }

    return data;
};


// Create a reusable transporter object using SMTP transport
// In development, you can use Ethereal (https://ethereal.email/)
const normalizarSmtpConfig = (config = {}) => {
    let host = config?.SMTP_HOST || process.env.SMTP_HOST;
    let port = Number(config?.SMTP_PORT || process.env.SMTP_PORT || 587);
    let secure = config?.SMTP_SECURE ?? (process.env.SMTP_SECURE === 'true');
    let user = config?.SMTP_USER || process.env.SMTP_USER;
    let pass = String(config?.SMTP_PASS || process.env.SMTP_PASS || '').replace(/\s+/g, '');

    if (port === 465) secure = true;
    if (port === 587 || port === 25) secure = false;

    return {
        host,
        port,
        secure,
        user,
        pass
    };
};

const opcoesTransporte = ({ host, port, secure, user, pass }) => ({
    host,
    port,
    secure,
    requireTLS: !secure,
    connectionTimeout: 12000,
    greetingTimeout: 12000,
    socketTimeout: 15000,
    auth: { user, pass },
    tls: {
        minVersion: 'TLSv1.2',
        servername: host
    }
});

// Create a reusable transporter object using SMTP transport
// In development, you can use Ethereal (https://ethereal.email/)
const createTransporter = async (config) => {
    let { host, port, secure, user, pass } = normalizarSmtpConfig(config);

    if (!host || !user) {
        let testAccount = await nodemailer.createTestAccount();
        host = "smtp.ethereal.email";
        port = 587;
        secure = false;
        user = testAccount.user;
        pass = testAccount.pass;
    }

    return nodemailer.createTransport(opcoesTransporte({ host, port, secure, user, pass }));
};

const testSmtp = async (smtpConfig, destinatario) => {
    if (usarBrevo()) {
        return await enviarPorBrevo({
            to: destinatario,
            subject: 'Teste Brevo - Plataforma de Badges Softinsa',
            html: '<h2>Configuração Brevo válida</h2><p>Este email confirma que a Plataforma de Badges Softinsa consegue enviar mensagens pela API Brevo.</p>',
            config: smtpConfig
        });
    }

    const { host, port, secure, user, pass } = normalizarSmtpConfig(smtpConfig);
    if (!host || !user || !pass) {
        throw new Error('Preencha o servidor SMTP, o utilizador e a password antes de testar.');
    }
    const transporter = nodemailer.createTransport(opcoesTransporte({ host, port, secure, user, pass }));
    try {
        await transporter.verify();
        return await transporter.sendMail({
            from: `"Plataforma de Badges Softinsa" <${user}>`,
            to: destinatario,
            subject: 'Teste SMTP - Plataforma de Badges Softinsa',
            html: '<h2>Configuração SMTP válida</h2><p>Este email confirma que a Plataforma de Badges Softinsa consegue enviar mensagens com as credenciais configuradas.</p>'
        });
    } catch (error) {
        if (error.code === 'ETIMEDOUT' || error.code === 'ESOCKET' || error.message?.toLowerCase().includes('timeout')) {
            throw new Error(`Timeout ao ligar ao SMTP ${host}:${port}. Confirme host, porta, SSL e se o Render consegue sair para esse servidor.`);
        }
        if (error.code === 'EAUTH' || error.responseCode === 535) {
            throw new Error('Autenticação SMTP falhou. No Gmail use uma palavra-passe de app de 16 caracteres, não a password normal da conta.');
        }
        throw error;
    } finally {
        transporter.close();
    }
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

        if (usarBrevo()) {
            const infoBrevo = await enviarPorBrevo({ to, subject, html, config });
            console.log("Email Brevo enviado: %s", infoBrevo.messageId || JSON.stringify(infoBrevo));
            return infoBrevo;
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
        return false;
    }
};

module.exports = {
    sendEmail,
    testSmtp
};
