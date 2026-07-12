const Pedido = require('../models/Pedido');
const Badge = require('../models/Badge');
const Consultor = require('../models/Consultor');
const ConsultorBadge = require('../models/ConsultorBadge');
const Utilizador = require('../models/Utilizador');
const ServiceLine = require('../models/ServiceLine');
const { Op } = require('sequelize');

const getSL = (badge) => {
    if (!badge || !badge.CATEGORIA_BADGE) return 'Indefinida';
    try {
        const cat = JSON.parse(badge.CATEGORIA_BADGE);
        if (cat.serviceLine) return cat.serviceLine;
    } catch(e) {}
    return badge.CATEGORIA_BADGE;
};

const controllers = {};

controllers.getDashboardTMData = async (req, res) => {
    try {
        // 1. Validações Pendentes
        const estadosPendentesTM = ['Pendente', 'Em Análise TM'];
        const validacoesPendentes = await Pedido.count({
            where: { ESTADO_PEDIDO: { [Op.in]: estadosPendentesTM } }
        });

        // 2. Badges Emitidos este Ano
        const anoAtual = new Date().getFullYear();
        const badgesEmitidosAnoNormais = await ConsultorBadge.count({
            where: { DATA_ATRIBUICAO_BADGE: { [Op.gte]: new Date(anoAtual, 0, 1) } }
        });
        const MarcoConsultor = require('../models/MarcoConsultor');
        const badgesEmitidosAnoMarcos = await MarcoConsultor.count({
            where: { DATA_CONQUISTA: { [Op.gte]: new Date(anoAtual, 0, 1) } }
        });
        const badgesEmitidosAno = badgesEmitidosAnoNormais + badgesEmitidosAnoMarcos;

        // 3. Consultores com Badges
        const totalConsultores = await Consultor.count();
        const consultoresComBadges = await ConsultorBadge.count({ distinct: true, col: 'ID_CONSULTOR' });
        const percentagemConsultores = totalConsultores > 0 ? Math.round((consultoresComBadges / totalConsultores) * 100) : 0;

        // 4. Badges Próximos da Expiração (Próximos 30 dias)
        const trintaDias = new Date();
        trintaDias.setDate(trintaDias.getDate() + 30);
        const badgesProximosExpiracao = await ConsultorBadge.count({
            where: { DATA_EXPIRACAO: { [Op.between]: [new Date(), trintaDias] } }
        });

        // 5. Lista de Pedidos Pendentes (Apenas os primeiros 3 para o ecrã)
        const pedidosBD = await Pedido.findAll({
            where: { ESTADO_PEDIDO: { [Op.in]: estadosPendentesTM } },
            include: [
                { model: Utilizador },
                { model: Badge }
            ],
            limit: 3,
            order: [['DATA_SUBMISSAO_PEDIDO', 'ASC']]
        });

        // Cálculo dinâmico do crescimento anual
        const anoAnterior = anoAtual - 1;
        const badgesAnoAnteriorNormais = await ConsultorBadge.count({
            where: { DATA_ATRIBUICAO_BADGE: { [Op.between]: [new Date(anoAnterior, 0, 1), new Date(anoAnterior, 11, 31)] } }
        });
        const badgesAnoAnteriorMarcos = await MarcoConsultor.count({
            where: { DATA_CONQUISTA: { [Op.between]: [new Date(anoAnterior, 0, 1), new Date(anoAnterior, 11, 31)] } }
        });
        const badgesAnoAnterior = badgesAnoAnteriorNormais + badgesAnoAnteriorMarcos;
        let crescimentoAno = 0;
        if (badgesAnoAnterior > 0) {
            crescimentoAno = Math.round(((badgesEmitidosAno - badgesAnoAnterior) / badgesAnoAnterior) * 100);
        } else if (badgesEmitidosAno > 0) {
            crescimentoAno = 100;
        }

        const Nivel = require('../models/Nivel');
        const todosNiveisDB = await Nivel.findAll();
        const mapaNiveisDB = {};
        todosNiveisDB.forEach(n => mapaNiveisDB[n.ID_NIVEL] = `Nível ${n.NOME_NIVEL}`);

        const pedidosLista = pedidosBD.map(p => {
            const badge = p.Badge;
            let slParsed = 'Indefinida';
            let areaParsed = 'Indefinida';
            if (badge) {
                try {
                    const catObj = JSON.parse(badge.CATEGORIA_BADGE);
                    if (catObj.serviceLine) slParsed = catObj.serviceLine;
                    if (catObj.area) areaParsed = catObj.area;
                } catch(e) {}
            }
            const nomeNivelStr = badge ? (mapaNiveisDB[badge.ID_NIVEL] || 'Indefinido') : 'Indefinido';
            return {
                id: p.ID_PEDIDO,
                nome: p.Utilizador?.NOME_COMPLETO_UTILIZADOR || 'Desconhecido',
                sl: `${slParsed} Service Line`,
                nivel: badge ? `${badge.NOME_BADGE} - Área de ${areaParsed} (${nomeNivelStr})` : 'Indefinido',
                urlImagem: badge ? badge.URL_IMAGEM : ''
            };
        });
        
        // Avisos Recentes
        const AvisoGeral = require('../models/AvisoGeral');
        const avisosBD = await AvisoGeral.findAll({ 
            where: { ESTADO_AVISO: 'Ativo' },
            order: [['DATA_PUBLICACAO_AVISO', 'DESC']], 
            limit: 3 
        });
        const avisos = avisosBD.map(a => {
            let typeColor = '#713FAA', icon = 'bi-gear-fill', bgClass = 'bg-info bg-opacity-10 border-info';
            switch (a.TIPO_NOTIFICACAO) {
                case 'system': typeColor = '#713FAA'; icon = 'bi-gear-fill'; bgClass = 'bg-info bg-opacity-10 border-info'; break;
                default: break;
            }
            return {
                id: a.ID_AVISO,
                titulo: a.TITULO_AVISO,
                mensagem: a.CONTEUDO_AVISO,
                dataStr: new Date(a.DATA_PUBLICACAO_AVISO).toLocaleDateString('pt-PT'),
                icone: icon,
                corIcone: typeColor,
                tipoCSS: bgClass
            };
        });

        // 6. Gráficos Dinâmicos
        const mesesLabels = [];
        const datasetsLinhas = [];
        const coresSL = ['#F93131', '#713FAA', '#0d6efd', '#20c997', '#fd7e14', '#6610f2', '#198754', '#0dcaf0', '#ffc107', '#dc3545'];

        for (let i = 6; i >= 0; i--) {
            const dataBase = new Date();
            dataBase.setMonth(dataBase.getMonth() - i);
            const nomeMes = dataBase.toLocaleString('pt-PT', { month: 'short' });
            mesesLabels.push(nomeMes.charAt(0).toUpperCase() + nomeMes.slice(1));
        }

        const todosOsBadgesAtribuidos = await ConsultorBadge.findAll({ include: [{ model: Badge }] });
        const mapSLGrafico = {};

        const serviceLinesAtivasGrafico = await ServiceLine.findAll({
            where: { ESTADO_ATIVO_SERVICE_LINE: true },
            order: [['NOME_SERVICE_LINE', 'ASC']]
        });
        serviceLinesAtivasGrafico.forEach(serviceLine => {
            mapSLGrafico[serviceLine.NOME_SERVICE_LINE] = { total: 0, dadosMensais: [0,0,0,0,0,0,0] };
        });

        // Agrupar por Service Line para ordenar a legenda sem esconder SLs com candidaturas.
        todosOsBadgesAtribuidos.forEach(cb => {
            const sl = getSL(cb.Badge);
            if(!mapSLGrafico[sl]) mapSLGrafico[sl] = { total: 0, dadosMensais: [0,0,0,0,0,0,0] };
            mapSLGrafico[sl].total++;
        });

        // Preencher dados mensais de todas as SLs com candidaturas no período.
        for (let i = 6; i >= 0; i--) {
            const indexLabel = 6 - i;
            const mesStart = new Date(new Date().getFullYear(), new Date().getMonth() - i, 1);
            const mesEnd = new Date(new Date().getFullYear(), new Date().getMonth() - i + 1, 0);

            const pedidosNesteMes = await Pedido.findAll({
                where: { DATA_SUBMISSAO_PEDIDO: { [Op.between]: [mesStart, mesEnd] } },
                include: [{ model: Badge }]
            });

            pedidosNesteMes.forEach(p => {
                const sl = getSL(p.Badge);
                if(!mapSLGrafico[sl]) mapSLGrafico[sl] = { total: 0, dadosMensais: [0,0,0,0,0,0,0] };
                mapSLGrafico[sl].dadosMensais[indexLabel]++;
            });
        }

        const slsGrafico = Object.keys(mapSLGrafico)
            .filter(sl => mapSLGrafico[sl].dadosMensais.some(valor => valor > 0))
            .sort((a,b) => mapSLGrafico[b].total - mapSLGrafico[a].total || a.localeCompare(b));

        slsGrafico.forEach((sl, index) => {
            datasetsLinhas.push({
                label: sl,
                data: mapSLGrafico[sl].dadosMensais,
                borderColor: coresSL[index % coresSL.length], backgroundColor: 'transparent', tension: 0.4, pointRadius: 4,
            });
        });

        const graficoLinhas = {
            labels: mesesLabels,
            datasets: datasetsLinhas.length > 0 ? datasetsLinhas : [{ label: 'Sem Dados', data: [0,0,0,0,0,0,0], borderColor: '#ccc' }]
        };

        const countNiveisTM = {};
        todosOsBadgesAtribuidos.forEach(cb => {
            const nivelId = cb.Badge?.ID_NIVEL;
            const nomeNivel = mapaNiveisDB[nivelId] || 'Indefinido';
            if(!countNiveisTM[nomeNivel]) countNiveisTM[nomeNivel] = 0;
            countNiveisTM[nomeNivel]++;
        });

        const graficoDoughnut = {
            labels: Object.keys(countNiveisTM).length > 0 ? Object.keys(countNiveisTM) : ['Sem Badges'],
            datasets: [{
                data: Object.keys(countNiveisTM).length > 0 ? Object.values(countNiveisTM) : [1],
                backgroundColor: ['#0d6efd', '#0dcaf0', '#ffc107', '#fd7e14', '#dc3545', '#6f42c1', '#20c997'],
                borderWidth: 0, cutout: '55%'
            }]
        };

        // 7. Dados dinâmicos para a tabela Top Service Lines, com badges normais e premium.
        const badgesAtribuidosStats = await ConsultorBadge.findAll({
            include: [{ model: Badge }]
        });
        
        const marcosAtribuidosStats = await MarcoConsultor.findAll();
        const todosConsultores = await Consultor.findAll({ include: [{ model: Utilizador }] });
        const MarcoConquista = require('../models/MarcoConquista');
        const todosMarcosCatalogo = await MarcoConquista.findAll();

        const mapSLStats = {};
        const serviceLines = await ServiceLine.findAll({
            where: { ESTADO_ATIVO_SERVICE_LINE: true },
            order: [['NOME_SERVICE_LINE', 'ASC']]
        });
        serviceLines.forEach(serviceLine => {
            const sl = serviceLine.NOME_SERVICE_LINE;
            mapSLStats[sl] = { sl, total: 0, pontos: 0 };
        });
        badgesAtribuidosStats.forEach(cb => {
            const sl = getSL(cb.Badge);
            const pontos = cb.Badge?.PONTOS_BADGE || 0;
            if(!mapSLStats[sl]) mapSLStats[sl] = { sl: sl, total: 0, pontos: 0 };
            mapSLStats[sl].total++;
            mapSLStats[sl].pontos += pontos;
        });
        
        marcosAtribuidosStats.forEach(mc => {
            const marcoDef = todosMarcosCatalogo.find(m => m.ID_MARCO === mc.ID_MARCO);
            const pontos = marcoDef ? marcoDef.PONTOS_EXTRA : 0;
            const consultor = todosConsultores.find(c => c.ID_CONSULTOR === mc.ID_CONSULTOR);
            const sl = consultor?.Utilizador?.SL_REGISTO || 'Indefinida';
            if(!mapSLStats[sl]) mapSLStats[sl] = { sl: sl, total: 0, pontos: 0 };
            mapSLStats[sl].total++;
            mapSLStats[sl].pontos += pontos;
        });

        const topServiceLines = Object.values(mapSLStats)
            .sort((a,b) => b.pontos - a.pontos || b.total - a.total)
            .slice(0, 5)
            .map((item, idx) => ({ ...item, rank: `${idx + 1}º` }));

        res.json({
            success: true,
            data: {
                stats: {
                    validacoesPendentes,
                    badgesEmitidosAno,
                    crescimentoAno: crescimentoAno,
                    consultoresComBadges,
                    percentagemConsultores,
                    badgesProximosExpiracao
                },
                pedidosPendentes: pedidosLista,
                graficoLinhas,
                graficoDoughnut,
                topServiceLines,
                avisos
            }
        });

    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

module.exports = controllers;
