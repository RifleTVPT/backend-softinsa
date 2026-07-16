const Consultor = require('../models/Consultor');
const ConsultorBadge = require('../models/ConsultorBadge');
const Badge = require('../models/Badge');
const HistoricoPontuacao = require('../models/HistoricoPontuacao');
const Notificacao = require('../models/Notificacao');
const Pedido = require('../models/Pedido');
const Requisito = require('../models/Requisito');
const Evidencia = require('../models/Evidencia');
const Nivel = require('../models/Nivel');
const AvisoGeral = require('../models/AvisoGeral');
const MarcoConsultor = require('../models/MarcoConsultor');
const MarcoConquista = require('../models/MarcoConquista');
const { Op } = require('sequelize');

const controllers = {};

const ordemNivelParaLetra = ordem => {
    let numero = Number(ordem);
    if (!Number.isInteger(numero) || numero < 1) return '';
    let letra = '';
    while (numero > 0) {
        numero -= 1;
        letra = String.fromCharCode(65 + (numero % 26)) + letra;
        numero = Math.floor(numero / 26);
    }
    return letra;
};

controllers.getDashboardData = async (req, res) => {
    try {
        const { id } = req.params; // id é o ID_UTILIZADOR

        // 1. Procurar o Consultor e Utilizador
        const consultor = await Consultor.findOne({ 
            where: { ID_UTILIZADOR: id },
            include: [{ model: require('../models/Utilizador') }]
        });
        if (!consultor) return res.status(404).json({ success: false, message: "Consultor não encontrado." });

        // KPIs de Pontos
        // KPIs de Pontos
        const umaSemanaAtras = new Date();
        umaSemanaAtras.setDate(umaSemanaAtras.getDate() - 7);
        
        const cbSemana = await ConsultorBadge.findAll({
            where: { ID_CONSULTOR: consultor.ID_CONSULTOR, DATA_ATRIBUICAO_BADGE: { [Op.gte]: umaSemanaAtras } },
            include: [{ model: Badge, attributes: ['PONTOS_BADGE'] }]
        });
        let pontosSemana = cbSemana.reduce((acc, cb) => acc + (cb.Badge?.PONTOS_BADGE || 0), 0);
        
        const mcSemana = await MarcoConsultor.findAll({
            where: { ID_CONSULTOR: consultor.ID_CONSULTOR, DATA_CONQUISTA: { [Op.gte]: umaSemanaAtras } }
        });
        const todosMarcosRaw = await MarcoConquista.findAll({ attributes: ['ID_MARCO', 'PONTOS_EXTRA'] });
        mcSemana.forEach(mc => {
            const marco = todosMarcosRaw.find(m => m.ID_MARCO == mc.ID_MARCO);
            if (marco) pontosSemana += marco.PONTOS_EXTRA;
        });

        // KPIs de Ano
        const anoAtual = new Date().getFullYear();
        
        const badgesAnoBase = await ConsultorBadge.count({
            where: { ID_CONSULTOR: consultor.ID_CONSULTOR, DATA_ATRIBUICAO_BADGE: { [Op.gte]: new Date(anoAtual, 0, 1) } }
        });
        const marcosAnoBase = await MarcoConsultor.count({
            where: { 
                ID_CONSULTOR: consultor.ID_CONSULTOR, 
                [Op.or]: [
                    { DATA_CONQUISTA: { [Op.gte]: new Date(anoAtual, 0, 1) } },
                    { DATA_CONQUISTA: null }
                ]
            }
        });
        const badgesAno = badgesAnoBase + marcosAnoBase;

        const badgesAnoAnteriorBase = await ConsultorBadge.count({
            where: { 
                ID_CONSULTOR: consultor.ID_CONSULTOR, 
                DATA_ATRIBUICAO_BADGE: { [Op.between]: [new Date(anoAtual - 1, 0, 1), new Date(anoAtual - 1, 11, 31)] } 
            }
        });
        const marcosAnoAnteriorBase = await MarcoConsultor.count({
            where: { 
                ID_CONSULTOR: consultor.ID_CONSULTOR, 
                DATA_CONQUISTA: { [Op.between]: [new Date(anoAtual - 1, 0, 1), new Date(anoAtual - 1, 11, 31)] } 
            }
        });
        const badgesAnoAnterior = badgesAnoAnteriorBase + marcosAnoAnteriorBase;
        const crescimentoAno = badgesAnoAnterior === 0 ? (badgesAno > 0 ? 100 : 0) : Math.round(((badgesAno - badgesAnoAnterior) / badgesAnoAnterior) * 100);

        // Ranking e Total de Consultores Dinâmicos
        const todosConsultores = await Consultor.findAll();
        const todosCb = await ConsultorBadge.findAll({ include: [{ model: Badge }] });
        const todosMcRaw = await MarcoConsultor.findAll();

        const cbMap = {};
        todosConsultores.forEach(c => cbMap[c.ID_CONSULTOR] = { pontos: 0, badgesCount: 0 });
        
        todosCb.forEach(cb => {
            if(cbMap[cb.ID_CONSULTOR] && cb.Badge) {
                cbMap[cb.ID_CONSULTOR].pontos += cb.Badge.PONTOS_BADGE;
                cbMap[cb.ID_CONSULTOR].badgesCount += 1;
            }
        });
        todosMcRaw.forEach(mc => {
            if(cbMap[mc.ID_CONSULTOR]) {
                const marco = todosMarcosRaw.find(m => m.ID_MARCO == mc.ID_MARCO);
                if (marco) {
                    cbMap[mc.ID_CONSULTOR].pontos += marco.PONTOS_EXTRA;
                    cbMap[mc.ID_CONSULTOR].badgesCount += 1;
                }
            }
        });
        
        todosConsultores.forEach(c => {
            c.pontosCalculados = cbMap[c.ID_CONSULTOR].pontos;
            c.badgesCalculados = cbMap[c.ID_CONSULTOR].badgesCount;
        });
        todosConsultores.sort((a, b) => b.pontosCalculados - a.pontosCalculados || b.badgesCalculados - a.badgesCalculados);

        const totalConsultores = todosConsultores.length;
        const ranking = todosConsultores.findIndex(c => c.ID_CONSULTOR === consultor.ID_CONSULTOR) + 1;
        const pontosAtuaisReais = cbMap[consultor.ID_CONSULTOR]?.pontos || 0;
        
        // Atualiza a variavel do consultor
        consultor.PONTUACAO_TOTAL = pontosAtuaisReais;

        // Próxima expiração
        const proximaExp = await ConsultorBadge.findOne({
            where: { ID_CONSULTOR: consultor.ID_CONSULTOR, DATA_EXPIRACAO: { [Op.gt]: new Date() } },
            include: [{ model: Badge }],
            order: [['DATA_EXPIRACAO', 'ASC']]
        });

        // 2. Gráfico Dinâmico (Últimos 6 meses de pontos acumulados real)
        const mesesLabels = [];
        const mesesValores = [];
        const dataAtualGraf = new Date();
        
        for (let i = 5; i >= 0; i--) {
            const dInicio = new Date(dataAtualGraf.getFullYear(), dataAtualGraf.getMonth() - i, 1);
            const dFim = new Date(dataAtualGraf.getFullYear(), dataAtualGraf.getMonth() - i + 1, 0, 23, 59, 59);
            
            const nomeMes = dInicio.toLocaleString('pt-PT', { month: 'short' });
            mesesLabels.push(nomeMes.charAt(0).toUpperCase() + nomeMes.slice(1));
            
            const badgesAteFim = await ConsultorBadge.findAll({
                where: { ID_CONSULTOR: consultor.ID_CONSULTOR, DATA_ATRIBUICAO_BADGE: { [Op.lte]: dFim } },
                include: [{ model: Badge }]
            });
            const pontosBadges = badgesAteFim.reduce((acc, cb) => acc + (cb.Badge?.PONTOS_BADGE || 0), 0);
            
            const marcosAteFim = await MarcoConsultor.findAll({
                where: { ID_CONSULTOR: consultor.ID_CONSULTOR, DATA_CONQUISTA: { [Op.lte]: dFim } }
            });
            let pontosMarcos = 0;
            marcosAteFim.forEach(mc => {
                const marco = todosMarcosRaw.find(m => m.ID_MARCO == mc.ID_MARCO);
                if (marco) pontosMarcos += marco.PONTOS_EXTRA;
            });

            mesesValores.push(pontosBadges + pontosMarcos);
        }
        const grafico = { labels: mesesLabels, valores: mesesValores };

        // 3. AVISOS E LEMBRETES (Com cores dinâmicas!)
        // Vamos buscar as últimas notificações pessoais e avisos gerais
        const notificacoes = await Notificacao.findAll({
            where: { ID_UTILIZADOR: id },
            order: [['DATA_ENVIO_NOTIFICACAO', 'DESC']],
            limit: 3
        });

        const avisosGerais = await AvisoGeral.findAll({
            where: { ESTADO_AVISO: 'Ativo', [Op.or]: [{ VISIBILIDADE_AVISO: 'Todos' }, { VISIBILIDADE_AVISO: 'Consultor' }] },
            order: [['DATA_PUBLICACAO_AVISO', 'DESC']],
            limit: 3
        });

        const allAlerts = [
            ...notificacoes.map(n => ({ ...n.toJSON(), isAvisoGeral: false, date: n.DATA_ENVIO_NOTIFICACAO })),
            ...avisosGerais.map(a => ({ ...a.toJSON(), isAvisoGeral: true, date: a.DATA_PUBLICACAO_AVISO }))
        ];
        allAlerts.sort((a, b) => new Date(b.date) - new Date(a.date));
        const top3Alerts = allAlerts.slice(0, 3);
        
        const avisosFormatados = top3Alerts.map(n => {
            let typeColor, icon, bgClass;
            const tipo = n.isAvisoGeral ? n.TIPO_NOTIFICACAO : n.TIPO_NOTIFICACAO;
            switch (tipo) {
                case 'accepted': 
                    typeColor = '#198754'; icon = 'bi-check-circle-fill'; bgClass = 'bg-success bg-opacity-10 border-success'; break;
                case 'rejected': 
                    typeColor = '#dc3545'; icon = 'bi-x-circle-fill'; bgClass = 'bg-danger bg-opacity-10 border-danger'; break;
                case 'badge': 
                    typeColor = '#0d6efd'; icon = 'bi-patch-check-fill'; bgClass = 'bg-primary bg-opacity-10 border-primary'; break;
                case 'system': 
                    typeColor = '#713FAA'; icon = 'bi-gear-fill'; bgClass = 'bg-info bg-opacity-10 border-info'; break;
                default: 
                    typeColor = '#fd7e14'; icon = 'bi-megaphone-fill'; bgClass = 'bg-warning bg-opacity-10 border-warning';
            }
            return {
                titulo: n.isAvisoGeral ? n.TITULO_AVISO : n.TITULO_NOTIFICACAO,
                mensagem: n.isAvisoGeral ? n.CONTEUDO_AVISO : n.MENSAGEM_NOTIFICACAO,
                data: new Date(n.date).toLocaleDateString('pt-PT'),
                icone: icon,
                corIcone: typeColor,
                tipoCSS: bgClass
            };
        });

        // 4. BADGES RECOMENDADOS (Inteligência da Service Line e Progressão)
        const meusBadges = await ConsultorBadge.findAll({
            where: {
                ID_CONSULTOR: consultor.ID_CONSULTOR,
                [Op.or]: [
                    { DATA_EXPIRACAO: null },
                    { DATA_EXPIRACAO: { [Op.gt]: new Date() } }
                ]
            },
            include: [{ model: Badge }]
        });
        const idsMeusBadges = meusBadges.map(cb => cb.ID_BADGE);

        const meusPedidos = await Pedido.findAll({
            where: { ID_UTILIZADOR: id },
            include: [{ model: Badge }]
        });
        const estadosEmCurso = [
            'Rascunho',
            'Pendente de Correção',
            'Pendente',
            'Em Análise TM',
            'Em Análise SLL'
        ];
        const idsMeusPedidos = meusPedidos
            .filter(p => estadosEmCurso.includes(p.ESTADO_PEDIDO))
            .map(p => p.ID_BADGE);

        let areaFoco = consultor.Utilizador.AREA_REGISTO || 'Global'; 
        
        const allInteractions = [
            ...meusBadges.map(cb => ({ badge: cb.Badge, date: cb.DATA_ATRIBUICAO_BADGE })),
            ...meusPedidos.map(p => ({ badge: p.Badge, date: p.DATA_SUBMISSAO_PEDIDO }))
        ];

        if (allInteractions.length > 0) {
            allInteractions.sort((a, b) => new Date(b.date) - new Date(a.date));
            const lastInteraction = allInteractions[0].badge;
            try {
                if (lastInteraction.CATEGORIA_BADGE.startsWith('{')) {
                    const catObj = JSON.parse(lastInteraction.CATEGORIA_BADGE);
                    areaFoco = catObj.area || catObj.serviceLine || lastInteraction.CATEGORIA_BADGE;
                } else {
                    areaFoco = lastInteraction.CATEGORIA_BADGE;
                }
            } catch(e) {
                areaFoco = lastInteraction.CATEGORIA_BADGE;
            }
        }

        const excludeIds = [...idsMeusBadges, ...idsMeusPedidos];

        const recomendados = await Badge.findAll({
            where: {
                CATEGORIA_BADGE: { [Op.like]: `%${areaFoco}%` },
                ID_BADGE: { [Op.notIn]: excludeIds.length > 0 ? excludeIds : [0] }
            },
            include: [{ model: Nivel }],
            order: [[Nivel, 'ORDEM_HIERARQUICA', 'ASC']],
            limit: 3
        });

        const badgesRecFormatados = recomendados.map(b => {
            let slParsed = 'Global';
            let areaParsed = '';
            try {
                const catObj = JSON.parse(b.CATEGORIA_BADGE);
                if (catObj.serviceLine) slParsed = catObj.serviceLine;
                if (catObj.area) areaParsed = catObj.area;
            } catch(e) {
                slParsed = b.CATEGORIA_BADGE || 'Global';
            }
            const nivelLetter = ordemNivelParaLetra(b.Nivel?.ORDEM_HIERARQUICA)
                || b.Nivel?.NOME_NIVEL
                || 'N/A';

            return {
                ID_BADGE: b.ID_BADGE,
                NOME_BADGE: b.NOME_BADGE,
                CATEGORIA_BADGE: b.CATEGORIA_BADGE,
                SERVICE_LINE: slParsed,
                AREA: areaParsed,
                NIVEL_STR: nivelLetter,
                URL_IMAGEM: b.URL_IMAGEM
            };
        });

        // 5. JORNADA DE CARREIRA (Candidaturas em progresso)
        const pedidosPendentes = await Pedido.findAll({
            where: { 
                ID_UTILIZADOR: id, 
                ESTADO_PEDIDO: { [Op.in]: ['Pendente de Correção', 'Rascunho'] } 
            },
            include: [{ model: Badge, include: [{ model: Nivel }] }]
        });

        const jornada = [];
        for (let p of pedidosPendentes) {
            const totalReq = await Requisito.count({ where: { ID_BADGE: p.ID_BADGE } });
            
            // Conta os ficheiros associados a este pedido
            const evidencias = await Evidencia.findAll({ where: { ID_PEDIDO: p.ID_PEDIDO } });
            
            // Só conta como "submetido" os requisitos únicos que tenham pelo menos um ficheiro associado (ID_REQUISITO !== null)
            const reqComFicheiros = new Set(evidencias.filter(e => e.ID_REQUISITO !== null).map(e => e.ID_REQUISITO)).size;
            
            // Só exibe qualquer candidatura se houver ficheiros associados (mesmo que não mapeados)
            if (evidencias.length === 0) {
                continue;
            }
            
            let slParsed = 'Global';
            let areaParsed = 'Global';
            try {
                const catObj = JSON.parse(p.Badge.CATEGORIA_BADGE);
                if (catObj.serviceLine) slParsed = catObj.serviceLine;
                if (catObj.area) areaParsed = catObj.area;
            } catch(e) {}

            const levelLetter = ordemNivelParaLetra(p.Badge.Nivel?.ORDEM_HIERARQUICA)
                || p.Badge.Nivel?.NOME_NIVEL
                || 'N/A';

            jornada.push({
                idBadge: p.ID_BADGE,
                nome: p.Badge.NOME_BADGE,
                serviceLine: slParsed,
                area: areaParsed,
                nivel: levelLetter,
                reqSubmetidos: reqComFicheiros,
                reqTotais: totalReq === 0 ? 1 : totalReq
            });
        }

        // Progresso na Service Line do consultor, excluindo badges de outras SL.
        const serviceLineConsultor = consultor.Utilizador?.SL_REGISTO;
        const badgePertenceServiceLine = badge => {
            if (!serviceLineConsultor || !badge?.CATEGORIA_BADGE) return !serviceLineConsultor;
            try {
                return JSON.parse(badge.CATEGORIA_BADGE).serviceLine === serviceLineConsultor;
            } catch (_) {
                return badge.CATEGORIA_BADGE === serviceLineConsultor;
            }
        };
        const totalBadgesBD = serviceLineConsultor
            ? await Badge.count({
                where: { CATEGORIA_BADGE: { [Op.like]: `%${serviceLineConsultor}%` } }
            })
            : await Badge.count();
        const badgesObtidosNaSL = meusBadges.filter(cb => badgePertenceServiceLine(cb.Badge)).length;
        const progressoPercent = totalBadgesBD > 0
            ? Math.round((badgesObtidosNaSL / totalBadgesBD) * 100)
            : 0;

        res.json({
            success: true,
            data: {
                stats: {
                    totalPontos: consultor.PONTUACAO_TOTAL,
                    pontosSemana: pontosSemana,
                    badgesAno: badgesAno,
                    crescimentoAno: crescimentoAno,
                    ranking: ranking,
                    totalConsultores: totalConsultores,
                    proximaExpiracao: proximaExp?.Badge?.NOME_BADGE || "Nenhum prestes a expirar",
                    diasParaExpirar: proximaExp ? Math.ceil((new Date(proximaExp.DATA_EXPIRACAO) - new Date()) / (1000 * 60 * 60 * 24)) : 0,
                    progressoGeral: progressoPercent
                },
                grafico: grafico,
                avisos: avisosFormatados,
                badgesRecomendados: badgesRecFormatados,
                jornadaCarreira: jornada
            }
        });

    } catch (error) {
        res.status(500).json({ success: false, message: 'Ocorreu um erro inesperado. Tente novamente mais tarde.' });
    }
};

module.exports = controllers;
