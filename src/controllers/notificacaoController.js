const Notificacao = require('../models/Notificacao');

const controllers = {};

controllers.getByUser = async (req, res) => {
    try {
        const { idUtilizador } = req.params;
        const notifs = await Notificacao.findAll({ 
            where: { ID_UTILIZADOR: idUtilizador },
            order: [['DATA_ENVIO_NOTIFICACAO', 'DESC']]
        });

        // Formatar para o frontend
        const formatadas = notifs.map(n => {
            const dataObj = new Date(n.DATA_ENVIO_NOTIFICACAO);
            return {
                id: n.ID_NOTIFICACAO,
                type: n.TIPO_NOTIFICACAO,
                title: n.TITULO_NOTIFICACAO,
                desc: n.MENSAGEM_NOTIFICACAO,
                time: dataObj.toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' }),
                date: dataObj.toLocaleDateString('pt-PT'),
                read: n.ESTADO_LIDO
            }
        });

        res.json({ success: true, data: formatadas });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

controllers.markAsRead = async (req, res) => {
    try {
        await Notificacao.update(
            { ESTADO_LIDO: true },
            { where: { ID_NOTIFICACAO: req.params.id } }
        );
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

controllers.markAllAsRead = async (req, res) => {
    try {
        await Notificacao.update(
            { ESTADO_LIDO: true },
            { where: { ID_UTILIZADOR: req.params.idUtilizador } }
        );
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

module.exports = controllers;