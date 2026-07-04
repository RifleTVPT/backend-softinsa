const ObjetivoTimeline = require('../models/ObjetivoTimeline');

const controllers = {};

controllers.getObjetivosConsultor = async (req, res) => {
    try {
        const { idUtilizador } = req.params;
        const objetivosBD = await ObjetivoTimeline.findAll({
            where: { ID_UTILIZADOR: idUtilizador },
            order: [['DATA_OBJETIVO', 'ASC']] // Ordena por data
        });

        const agora = new Date();
        const dadosFormatados = objetivosBD.map(obj => {
            const dataLimite = new Date(obj.DATA_OBJETIVO);
            const concluido = obj.STATUS === 'Concluído';
            const dataComparacao = concluido && obj.DATA_CONCLUSAO
                ? new Date(obj.DATA_CONCLUSAO)
                : agora;
            const diasAtraso = dataComparacao > dataLimite
                ? Math.ceil((dataComparacao - dataLimite) / (1000 * 60 * 60 * 24))
                : 0;

            return {
                id: obj.ID_OBJETIVO,
                autor: obj.ORIGEM,
                titulo: obj.TITULO,
                status: !concluido && diasAtraso > 0 ? 'Atrasado' : obj.STATUS,
                concluido,
                atrasado: diasAtraso > 0,
                diasAtraso,
                corStatus: diasAtraso > 0 ? 'danger' : (concluido ? 'success' : 'primary'),
                data: dataLimite.toLocaleDateString('pt-PT'),
                dataConclusao: obj.DATA_CONCLUSAO ? new Date(obj.DATA_CONCLUSAO).toLocaleDateString('pt-PT') : null
            };
        });

        res.json({ success: true, data: dadosFormatados });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

controllers.criarObjetivo = async (req, res) => {
    try {
        const { idUtilizador, titulo, dataMeta, descricao, origem, enviarNotificacao } = req.body;

        const novo = await ObjetivoTimeline.create({
            ID_UTILIZADOR: idUtilizador,
            TITULO: titulo,
            DESCRICAO: descricao,
            DATA_OBJETIVO: dataMeta,
            STATUS: 'Em Progresso',
            ORIGEM: origem
        });

        if (enviarNotificacao) {
            const pushService = require('../services/pushService');
            await pushService.sendPush(
                idUtilizador, 
                'info', 
                'Novo Objetivo', 
                `Novo objetivo atribuído por ${origem || 'Talent Manager'}: "${titulo}". Data limite: ${new Date(dataMeta).toLocaleDateString('pt-PT')}`,
                'objetivos',
                'Consultor'
            );
        }

        res.json({ success: true, message: "Objetivo adicionado com sucesso!", data: novo });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

controllers.marcarConcluido = async (req, res) => {
    try {
        const { idObjetivo } = req.params;
        
        await ObjetivoTimeline.update(
            { STATUS: 'Concluído', DATA_CONCLUSAO: new Date() },
            { where: { ID_OBJETIVO: idObjetivo } }
        );

        res.json({ success: true, message: "Objetivo concluído com sucesso!" });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

module.exports = controllers;
