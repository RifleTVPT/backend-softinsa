const Notificacao = require('../models/Notificacao');
const ConfiguracoesSistema = require('../models/ConfiguracoesSistema');
const Utilizador = require('../models/Utilizador');
const firebase = require('../config/firebase');
const perfisNormalizados = (perfilStr) => String(perfilStr || '')
    .split(' / ')
    .map(perfil => perfil.trim() === 'Service Line Leader' ? 'SLL' : perfil.trim())
    .filter(Boolean);

const canalPermitido = (matriz, eventoId, perfilStr, canal) => {
    const perfis = perfisNormalizados(perfilStr);
    if (perfis.length === 0 || !matriz[eventoId]) return true;
    return perfis.some(perfil => matriz[eventoId]?.[perfil]?.[canal] !== false);
};


/**
 * Cria uma notificação na plataforma respeitando as regras globais e da matriz
 * @param {number} idUtilizador - ID do destinatário
 * @param {string} tipo - 'INFO', 'SUCESSO', 'AVISO', etc
 * @param {string} titulo - Título da notificação
 * @param {string} mensagem - Corpo da notificação
 * @param {string} eventoId - ID do evento (ex: 'pedidos', 'validacao', 'badges')
 * @param {string} perfilStr - Perfil alvo (ex: 'Consultor', 'Talent Manager', 'SLL')
 */
const sendPush = async (idUtilizador, tipo, titulo, mensagem, eventoId = null, perfilStr = null) => {
    try {
        const config = await ConfiguracoesSistema.findByPk(1);

        // Validação Global
        if (config && config.GLOBAL_PUSH === false) {
            console.log(`Push cancelado: Envio global de push está inativo. (Para: User ${idUtilizador})`);
            return null;
        }

        // Validação por Matriz
        if (config && config.MATRIZ_NOTIFICACOES && eventoId && perfilStr) {
            try {
                const matriz = JSON.parse(config.MATRIZ_NOTIFICACOES);
                if (!canalPermitido(matriz, eventoId, perfilStr, 'push')) return null;
            } catch (error) {
                console.error('Matriz de notificações inválida:', error);
            }
        }

        // Criar Notificação na BD
        const novaNotif = await Notificacao.create({
            ID_UTILIZADOR: idUtilizador,
            TIPO_NOTIFICACAO: tipo,
            TITULO_NOTIFICACAO: titulo,
            MENSAGEM_NOTIFICACAO: mensagem,
            ESTADO_LIDO: false
        });

        const utilizador = await Utilizador.findByPk(idUtilizador);
        if (utilizador?.FCM_TOKEN) {
            try {
                await firebase.sendPushNotification(
                    utilizador.FCM_TOKEN,
                    titulo,
                    mensagem,
                    {
                        tipo: String(tipo || 'info'),
                        evento: String(eventoId || '')
                    }
                );
            } catch (fcmError) {
                console.error(`Falha no envio FCM para User ${idUtilizador}:`, fcmError.message);
            }
        }

        console.log(`Push gerado com sucesso para o User ${idUtilizador} - Título: ${titulo}`);
        return novaNotif;
    } catch (error) {
        console.error("Erro ao gerar Push Notification:", error);
        return false;
    }
};

module.exports = {
    sendPush
};
