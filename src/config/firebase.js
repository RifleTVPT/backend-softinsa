const { initializeApp, cert } = require('firebase-admin/app');
const { getMessaging } = require('firebase-admin/messaging');
require('dotenv').config();

let isInitialized = false;

try {
    // Para produção, normalmente usa-se as variáveis de ambiente com o JSON do Service Account process.env.FIREBASE_SERVICE_ACCOUNT_BASE64
    // inicializamos com valores vazios para não rebentar a app mas bloqueamos os envios se não estiver configurado corretamente
    if (process.env.FIREBASE_SERVICE_ACCOUNT_BASE64) {
        const serviceAccount = JSON.parse(Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT_BASE64, 'base64').toString('ascii'));
        initializeApp({
            credential: cert(serviceAccount)
        });
        isInitialized = true;
        console.log("Firebase Admin inicializado com sucesso.");
    } else {
        console.warn("AVISO: Variável FIREBASE_SERVICE_ACCOUNT_BASE64 não encontrada. Firebase Cloud Messaging (FCM) desativado em modo de simulação.");
    }
} catch (error) {
    console.error("Erro ao inicializar Firebase Admin:", error.message);
}

/**
 * Envia uma notificação Push (FCM)
 * @param {string} token - FCM Device Token do utilizador
 * @param {string} title - Título da notificação
 * @param {string} body - Corpo da notificação
 * @param {object} data - Dados extra (opcional)
 */
const sendPushNotification = async (token, title, body, data = {}) => {
    if (!isInitialized) {
        console.log(`[SIMULAÇÃO FCM] A enviar Push para ${token}: ${title} - ${body}`);
        return true;
    }

    const message = {
        notification: {
            title,
            body
        },
        data: {
            ...data,
            click_action: 'FLUTTER_NOTIFICATION_CLICK' // Para app Flutter
        },
        token
    };

    try {
        const response = await getMessaging().send(message);
        console.log('Successfully sent push message:', response);
        return response;
    } catch (error) {
        console.error('Error sending push message:', error);
        return false;
    }
};

module.exports = {
    sendPushNotification
};
