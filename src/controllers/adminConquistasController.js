const MarcoConquista = require('../models/MarcoConquista');
const LogAtividadeSistema = require('../models/LogAtividadeSistema');
const MarcoConsultor = require('../models/MarcoConsultor');
const Consultor = require('../models/Consultor');
const Utilizador = require('../models/Utilizador');
const pushService = require('../services/pushService');
const mailer = require('../config/mailer');
const HistoricoPontuacao = require('../models/HistoricoPontuacao');
const { Op } = require('sequelize');
const { uploadMulterFile } = require('../services/cloudFileService');

const controllers = {};

const dataCriacaoMarco = marco => marco.DATA_CRIACAO_MARCO ? new Date(marco.DATA_CRIACAO_MARCO) : new Date(0);
const addMeses = (data, meses) => {
    const d = new Date(data);
    d.setMonth(d.getMonth() + Number(meses || 0));
    return d;
};

const janelaRanking = marco => {
    if (marco.TIPO_MARCO === 'MELHOR_ANO') {
        const ano = Number(marco.PARAMETRO_1);
        return { inicio: new Date(ano, 0, 1), fim: new Date(ano + 1, 0, 1) };
    }
    if (marco.TIPO_MARCO === 'MELHOR_MESES') {
        const inicio = dataCriacaoMarco(marco);
        return { inicio, fim: addMeses(inicio, marco.PARAMETRO_1 || 1) };
    }
    return null;
};

const pontosPeriodo = async (idUtilizador, inicio, fim) => {
    const linhas = await HistoricoPontuacao.findAll({
        where: {
            ID_UTILIZADOR: idUtilizador,
            DATA_ATRIBUICAO: { [Op.gte]: inicio, [Op.lt]: fim },
            ORIGEM_PONTOS: { [Op.notLike]: 'Badge premium:%' }
        }
    });
    return linhas.reduce((total, linha) => total + (Number(linha.PONTOS_OBTIDOS) || 0), 0);
};

const atribuirMarco = async (marco, consultor) => {
    const existente = await MarcoConsultor.findOne({
        where: { ID_CONSULTOR: consultor.ID_CONSULTOR, ID_MARCO: marco.ID_MARCO }
    });
    if (existente) return false;

    await MarcoConsultor.create({
        ID_CONSULTOR: consultor.ID_CONSULTOR,
        ID_MARCO: marco.ID_MARCO,
        DATA_CONQUISTA: new Date()
    });
    await consultor.update({
        PONTUACAO_TOTAL: (Number(consultor.PONTUACAO_TOTAL) || 0) + (Number(marco.PONTOS_EXTRA) || 0)
    });
    await HistoricoPontuacao.create({
        ID_UTILIZADOR: consultor.ID_UTILIZADOR,
        DATA_ATRIBUICAO: new Date(),
        PONTOS_OBTIDOS: marco.PONTOS_EXTRA || 0,
        ORIGEM_PONTOS: `Badge premium: ${marco.TITULO_MARCO}`
    });
    await LogAtividadeSistema.create({
        ID_UTILIZADOR: consultor.ID_UTILIZADOR,
        TIPO_ATIVIDADE: 'Badge Premium Obtido',
        DETALHES_ATIVIDADE: `Ganhou automaticamente o badge premium ${marco.TITULO_MARCO}`,
        DATA_HORA_ATIVIDADE: new Date()
    });

    const utilizador = await Utilizador.findByPk(consultor.ID_UTILIZADOR);
    if (utilizador) {
        const mensagemPremium = [
            `Parabéns, obteve a conquista especial "${marco.TITULO_MARCO}"!`,
            `Esta conquista premium foi atribuída por cumprir uma regra especial da plataforma.`,
            `Pontos bónus adicionados: +${marco.PONTOS_EXTRA || 0}.`,
            'Para consultar esta conquista, aceda a Conquistas Especiais.',
            'As conquistas especiais aparecem com destaque dourado e podem ser consultadas, partilhadas e validadas através da página pública.'
        ].join('\n\n');
        pushService.sendPush(utilizador.ID_UTILIZADOR, 'success', 'Novo Badge Premium Obtido', mensagemPremium, 'badges', utilizador.PERFIL_UTILIZADOR);
        try {
            await mailer.sendEmail(
                utilizador.EMAIL_UTILIZADOR,
                'Novo Badge Premium Obtido - Plataforma de Badges Softinsa',
                `<h2>Novo Badge Premium Obtido</h2><p>Olá, ${utilizador.NOME_COMPLETO_UTILIZADOR}.</p>${mensagemPremium.split('\n\n').map(paragrafo => `<p>${paragrafo}</p>`).join('')}`,
                'badges',
                utilizador.PERFIL_UTILIZADOR
            );
        } catch (mailErr) {
            console.error('Falha ao enviar email de badge premium obtido:', mailErr);
        }
    }
    return true;
};

const processarMarcoRanking = async (marco) => {
    const janela = janelaRanking(marco);
    if (!janela || new Date() < janela.fim) return false;
    const jaAtribuido = await MarcoConsultor.findOne({ where: { ID_MARCO: marco.ID_MARCO } });
    if (jaAtribuido) return false;

    const consultores = await Consultor.findAll();
    let vencedor = null;
    let maiorPontuacao = -1;
    for (const consultor of consultores) {
        const pontos = await pontosPeriodo(consultor.ID_UTILIZADOR, janela.inicio, janela.fim);
        if (pontos > maiorPontuacao || (pontos === maiorPontuacao && vencedor && consultor.ID_CONSULTOR < vencedor.ID_CONSULTOR)) {
            vencedor = consultor;
            maiorPontuacao = pontos;
        }
    }
    if (!vencedor || maiorPontuacao <= 0) return false;
    return atribuirMarco(marco, vencedor);
};

// Helper to generate human-readable "como obter" text
const gerarTextoComoObter = (tipo, param1, param2) => {
    const t = tipo || 'TOTAL_PONTOS';
    const p1 = param1 || (t === 'TOTAL_PONTOS' ? 1000 : 0);
    
    if (t === 'TOTAL_BADGES') return `Obtenha um total de ${p1} badge${p1 > 1 ? 's' : ''} aprovados na plataforma. Cada badge aprovado pelo seu Talent Manager conta para este total.`;
    if (t === 'TOTAL_PONTOS') return `Acumule um total de ${p1} pontos na plataforma. Cada badge aprovado adiciona pontos à sua pontuação total.`;
    if (t === 'BADGES_DIAS') return `Obtenha ${p1} badge${p1 > 1 ? 's' : ''} num período de ${param2} dias consecutivos. Os badges têm que ser todos aprovados dentro deste intervalo de tempo.`;
    if (t === 'MELHOR_ANO') return `Seja o consultor com mais pontos acumulados no ano civil de ${p1}. O ranking é processado pelo administrador no final do ano.`;
    if (t === 'MELHOR_MESES') return `Seja o consultor com mais pontos acumulados durante ${p1} mes${p1 > 1 ? 'es' : ''} consecutivos. O ranking é processado periodicamente pelo administrador.`;
    
    return 'Complete os objetivos associados a esta conquista especial.';
};

controllers.listarConquistas = async (req, res) => {
    try {
        const marcos = await MarcoConquista.findAll();
        const formatados = marcos.map(m => ({
            id: m.ID_MARCO,
            titulo: m.TITULO_MARCO,
            desc: m.DESCRICAO_MARCO,
            bonus: m.PONTOS_EXTRA,
            tipo: m.TIPO_MARCO,
            param1: m.PARAMETRO_1,
            param2: m.PARAMETRO_2,
            imagem: m.URL_IMAGEM_MARCO,
            comoObter: gerarTextoComoObter(m.TIPO_MARCO, m.PARAMETRO_1, m.PARAMETRO_2)
        }));
        res.json({ success: true, data: formatados });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

controllers.getDetalhesConquista = async (req, res) => {
    try {
        const { id } = req.params;
        const marco = await MarcoConquista.findByPk(id);
        if (!marco) return res.status(404).json({ success: false, message: 'Conquista não encontrada' });

        res.json({
            success: true,
            data: {
                id: marco.ID_MARCO,
                titulo: marco.TITULO_MARCO,
                desc: marco.DESCRICAO_MARCO,
                bonus: marco.PONTOS_EXTRA,
                tipo: marco.TIPO_MARCO,
                param1: marco.PARAMETRO_1,
                param2: marco.PARAMETRO_2,
                imagem: marco.URL_IMAGEM_MARCO,
                comoObter: gerarTextoComoObter(marco.TIPO_MARCO, marco.PARAMETRO_1, marco.PARAMETRO_2)
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

controllers.criarConquista = async (req, res) => {
    try {
        const { titulo, desc, bonus, tipo, param1, param2 } = req.body;
        const anoAtual = new Date().getFullYear();
        if (tipo === 'MELHOR_ANO' && parseInt(param1, 10) < anoAtual) {
            return res.status(400).json({ success: false, message: `O ano alvo não pode ser anterior a ${anoAtual}.` });
        }
        
        let imagemUrl = null;
        if (req.file) {
            const uploadedImage = await uploadMulterFile(req, req.file, {
                folder: 'softinsa/premium',
                resourceType: 'auto'
            });
            imagemUrl = uploadedImage.url;
            console.log('[Premium] Imagem guardada no Cloudinary/local:', imagemUrl);
        }

        const comoObterText = gerarTextoComoObter(tipo, param1, param2);

        const novo = await MarcoConquista.create({
            TITULO_MARCO: titulo,
            DESCRICAO_MARCO: desc || comoObterText,
            PONTOS_EXTRA: parseInt(bonus),
            REGRA_ATRIBUICAO: comoObterText,
            URL_IMAGEM_MARCO: imagemUrl || '/uploads/default-trophy.png',
            TIPO_MARCO: tipo,
            PARAMETRO_1: param1 ? parseInt(param1) : null,
            PARAMETRO_2: param2 ? parseInt(param2) : null,
            DATA_CRIACAO_MARCO: new Date()
        });

        const utilizadores = await Utilizador.findAll({ where: { ESTADO_CONTA_UTILIZADOR: 'Ativo' } });
        for (const utilizador of utilizadores) {
            pushService.sendPush(utilizador.ID_UTILIZADOR, 'info', 'Novo Badge Premium', `O badge premium "${titulo}" foi criado e já está disponível.`, 'badges', utilizador.PERFIL_UTILIZADOR);
        }
        await LogAtividadeSistema.create({ ID_UTILIZADOR: req.userId || 1, TIPO_ATIVIDADE: 'Criação Badge Premium', DETALHES_ATIVIDADE: `Criou o Badge Premium: ${titulo}`, DATA_HORA_ATIVIDADE: new Date() });

        res.json({ success: true, data: novo, message: 'Conquista Especial criada com sucesso!' });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

controllers.eliminarConquista = async (req, res) => {
    try {
        const { id } = req.params;
        const marco = await MarcoConquista.findByPk(id);
        if (!marco) return res.status(404).json({ success: false, message: 'Conquista não encontrada.' });

        const atribuicoes = await MarcoConsultor.findAll({ where: { ID_MARCO: id } });
        for (const atribuicao of atribuicoes) {
            const consultor = await Consultor.findByPk(atribuicao.ID_CONSULTOR);
            if (consultor) await consultor.update({ PONTUACAO_TOTAL: Math.max(0, (consultor.PONTUACAO_TOTAL || 0) - (marco.PONTOS_EXTRA || 0)) });
        }
        await MarcoConsultor.destroy({ where: { ID_MARCO: id }});
        await marco.destroy();

        const utilizadores = await Utilizador.findAll({ where: { ESTADO_CONTA_UTILIZADOR: 'Ativo' } });
        for (const utilizador of utilizadores) {
            pushService.sendPush(utilizador.ID_UTILIZADOR, 'warning', 'Badge Premium Eliminado', `O badge premium "${marco.TITULO_MARCO}" foi eliminado da plataforma.`, 'badges', utilizador.PERFIL_UTILIZADOR);
        }
        await LogAtividadeSistema.create({ ID_UTILIZADOR: req.userId || 1, TIPO_ATIVIDADE: 'Eliminação Badge Premium', DETALHES_ATIVIDADE: `Eliminou o Badge Premium: ${marco.TITULO_MARCO}`, DATA_HORA_ATIVIDADE: new Date() });

        res.json({ success: true, message: 'Conquista eliminada com sucesso.' });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

controllers.processarRankings = async (req, res) => {
    try {
        const conquistasRanking = await MarcoConquista.findAll({
            where: { TIPO_MARCO: { [Op.in]: ['MELHOR_ANO', 'MELHOR_MESES'] } }
        });

        if (conquistasRanking.length === 0) {
            return res.json({ success: true, message: 'Nenhuma regra de Ranking encontrada para processar.' });
        }

        let premiados = 0;

        for (const marco of conquistasRanking) {
            const atribuido = await processarMarcoRanking(marco);
            if (atribuido) premiados++;
        }

        res.json({ success: true, message: `Rankings processados com sucesso. ${premiados} novas conquistas atribuídas.` });
    } catch (error) {
        console.error('ERRO PROCESSAR RANKINGS:', error);
        res.status(500).json({ success: false, message: error.message });
    }
};

module.exports = controllers;
