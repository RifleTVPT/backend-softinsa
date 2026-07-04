const Pedido = require('../models/Pedido');
const Badge = require('../models/Badge');
const Consultor = require('../models/Consultor');
const Utilizador = require('../models/Utilizador');
const ConsultorBadge = require('../models/ConsultorBadge');
const MarcoConsultor = require('../models/MarcoConsultor');
const MarcoConquista = require('../models/MarcoConquista');
const LogExportacao = require('../models/LogExportacao');
const { Op } = require('sequelize'); // <-- Importante para o Talent Manager
const { obterServiceLineSLL } = require('../utils/sllServiceLineHelper');
const Nivel = require('../models/Nivel');

const controllers = {};

// =========================================================================
// MÉTODOS DO CONSULTOR
// =========================================================================

controllers.gerarRelatorioConsultor = async (req, res) => {
    try {
        const { idUtilizador, filtros, opcoes, formatoExportacao } = req.body;
        const consultor = await Consultor.findOne({ where: { ID_UTILIZADOR: idUtilizador } });
        
        if (!consultor) return res.status(404).json({ success: false, message: "Consultor não encontrado." });

        let respostaDados = {};

        // 1. MÉTRICAS DE APROVAÇÃO E REJEIÇÃO
        if (opcoes.metricas) {
            const pedidos = await Pedido.findAll({ where: { ID_UTILIZADOR: idUtilizador } });
            respostaDados.metricas = {
                aprovados: pedidos.filter(p => p.ESTADO_PEDIDO === 'Aceite').length,
                rejeitados: pedidos.filter(p => p.ESTADO_PEDIDO === 'Recusado').length,
                pendentes: pedidos.filter(p => p.ESTADO_PEDIDO === 'Pendente').length,
            };
        }

        // 2. DETALHES DE BADGES OBTIDOS
        if (opcoes.badgesObtidos) {
            const badgesBD = await ConsultorBadge.findAll({
                where: { ID_CONSULTOR: consultor.ID_CONSULTOR },
                include: [{ model: Badge }]
            });
            
            let listaMista = badgesBD.map(b => {
                let sl = b.Badge?.CATEGORIA_BADGE || 'N/A';
                try { if (sl.startsWith('{')) { const obj = JSON.parse(sl); sl = `${obj.serviceLine || ''} - ${obj.area || ''}`; } } catch(e){}
                return {
                    nome: b.Badge?.NOME_BADGE || 'N/A',
                    area: sl,
                    pontos: b.Badge?.PONTOS_BADGE || 0,
                    dataRaw: b.DATA_ATRIBUICAO_BADGE,
                    data: new Date(b.DATA_ATRIBUICAO_BADGE).toLocaleDateString('pt-PT')
                };
            });

            // Adicionar Badges Premium
            const marcosBD = await MarcoConsultor.findAll({ where: { ID_CONSULTOR: consultor.ID_CONSULTOR } });
            if (marcosBD.length > 0) {
                const todosMarcosRaw = await MarcoConquista.findAll();
                marcosBD.forEach(mc => {
                    const mk = todosMarcosRaw.find(m => m.ID_MARCO === mc.ID_MARCO);
                    if (mk) {
                        listaMista.push({
                            nome: mk.TITULO_MARCO || 'Premium Badge',
                            area: 'Conquista Especial',
                            pontos: mk.PONTOS_EXTRA || 0,
                            dataRaw: mc.DATA_CONQUISTA,
                            data: new Date(mc.DATA_CONQUISTA).toLocaleDateString('pt-PT')
                        });
                    }
                });
            }

            listaMista.sort((a, b) => new Date(b.dataRaw) - new Date(a.dataRaw));
            respostaDados.badgesObtidos = listaMista.map(({ dataRaw, ...rest }) => rest);
        }

        // 3. PEDIDOS PENDENTES E HISTÓRICO GERAL
        if (opcoes.pedidosPendentes || opcoes.historicoPedidos) {
            const pedidosGerais = await Pedido.findAll({
                where: { ID_UTILIZADOR: idUtilizador },
                include: [{ model: Badge }],
                order: [['DATA_SUBMISSAO_PEDIDO', 'DESC']]
            });

            if (opcoes.pedidosPendentes) {
                respostaDados.pedidosPendentes = pedidosGerais
                    .filter(p => p.ESTADO_PEDIDO === 'Pendente')
                    .map(p => ({
                        nome: p.Badge.NOME_BADGE,
                        data: new Date(p.DATA_SUBMISSAO_PEDIDO).toLocaleDateString('pt-PT'),
                        estado: p.ESTADO_PEDIDO
                    }));
            }

            if (opcoes.historicoPedidos) {
                respostaDados.historicoPedidos = pedidosGerais.map(p => ({
                    nome: p.Badge.NOME_BADGE,
                    data: new Date(p.DATA_SUBMISSAO_PEDIDO).toLocaleDateString('pt-PT'),
                    estado: p.ESTADO_PEDIDO,
                    ultimaAcao: new Date(p.DATA_ULTIMA_ATUALIZACAO).toLocaleDateString('pt-PT')
                }));
            }
        }

        // 4. RANKING COMPARAÇÃO
        if (opcoes.ranking) {
            const { getAllConsultorsStats } = require('../utils/pontosHelper');
            const estatisticas = await getAllConsultorsStats();
            const top10 = estatisticas.slice(0, 10);
            
            respostaDados.ranking = top10.map(s => ({
                nome: s.consultor.Utilizador?.NOME_COMPLETO_UTILIZADOR || 'Desconhecido',
                pontos: s.pontosCalculados
            }));
        }

        // 5. DETALHES DE BADGES ESPECIAIS (CONQUISTAS)
        if (opcoes.badgesEspeciais) {
            const marcosBD = await MarcoConsultor.findAll({
                where: { ID_CONSULTOR: consultor.ID_CONSULTOR }
            });
            
            // Fazer fetch manual se a associação não estiver definida
            const marcosDetalhes = [];
            for (let mc of marcosBD) {
                const det = await MarcoConquista.findByPk(mc.ID_MARCO);
                if (det) {
                    marcosDetalhes.push({
                        titulo: det.TITULO_MARCO,
                        pontos: det.PONTOS_EXTRA,
                        data: new Date(mc.DATA_CONQUISTA).toLocaleDateString('pt-PT')
                    });
                }
            }
            respostaDados.badgesEspeciais = marcosDetalhes;
        }

        // --- REGISTAR A AÇÃO DE EXPORTAÇÃO NO LOG (Auditoria) ---
        await LogExportacao.create({
            ID_UTILIZADOR: idUtilizador,
            TIPO_FICHEIRO: formatoExportacao,
            FILTROS_APLICADOS: JSON.stringify(filtros)
        });

        res.json({ success: true, data: respostaDados });

    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// =========================================================================
// MÉTODOS DO TALENT MANAGER
// =========================================================================

    controllers.gerarRelatorioTM = async (req, res) => {
    try {
        const { filtros, opcoes, idUtilizadorAtivo, formatoExportacao } = req.body;
        let dadosRelatorio = {};

        // === 1. CONSTRUÇÃO DE FILTROS ===
        let badgeWhere = {};
        let andConditions = [];
        if (filtros.sl && filtros.sl !== 'Todas') andConditions.push({ [Op.like]: `%"serviceLine":"${filtros.sl}"%` });
        if (filtros.area && filtros.area !== 'Todas') andConditions.push({ [Op.like]: `%"area":"${filtros.area}"%` });
        
        if (andConditions.length > 0) badgeWhere.CATEGORIA_BADGE = { [Op.and]: andConditions };

        if (filtros.niveis && filtros.niveis.length > 0 && filtros.niveis.length < 5) {
            const ordemPorLetra = { A: 1, B: 2, C: 3, D: 4, E: 5 };
            const ordens = filtros.niveis.map(n => ordemPorLetra[n]).filter(Boolean);
            const niveis = await Nivel.findAll({
                where: { ORDEM_HIERARQUICA: { [Op.in]: ordens } },
                attributes: ['ID_NIVEL']
            });
            badgeWhere.ID_NIVEL = { [Op.in]: niveis.map(n => n.ID_NIVEL) };
        }

        let utilizadorWhere = {};
        let pedidoWhere = {};
        if (filtros.pesquisa && filtros.pesquisa.trim() !== '') {
            utilizadorWhere.NOME_COMPLETO_UTILIZADOR = { [Op.like]: `%${filtros.pesquisa}%` };
            if (!isNaN(filtros.pesquisa)) pedidoWhere.ID_PEDIDO = parseInt(filtros.pesquisa);
        }

        let dataWhere = null;
        if (filtros.periodo !== 'Todos') {
            let dataMin = new Date();
            let dataMax = null;
            if (filtros.periodo === '3') Object.assign(dataMin, { month: dataMin.setMonth(dataMin.getMonth() - 3) });
            else if (filtros.periodo === '6') Object.assign(dataMin, { month: dataMin.setMonth(dataMin.getMonth() - 6) });
            else if (filtros.periodo === 'Personalizado') {
                dataMin = filtros.dataInicio ? new Date(filtros.dataInicio) : null;
                dataMax = filtros.dataFim ? new Date(filtros.dataFim) : null;
                if (dataMax) dataMax.setHours(23, 59, 59, 999);
            }
            if (dataMin && dataMax) dataWhere = { [Op.between]: [dataMin, dataMax] };
            else if (dataMin) dataWhere = { [Op.gte]: dataMin };
            else if (dataMax) dataWhere = { [Op.lte]: dataMax };
        }

        // --- APLICAR FILTROS ---
        // 1. Métricas de Aprovação / Rejeição
        if (opcoes.taxaAprovacao) {
            let baseWhere = {};
            if (dataWhere) baseWhere.DATA_SUBMISSAO_PEDIDO = dataWhere;
            if (pedidoWhere.ID_PEDIDO) baseWhere.ID_PEDIDO = pedidoWhere.ID_PEDIDO;

            const aprovados = await Pedido.count({ 
                where: { ...baseWhere, ESTADO_PEDIDO: { [Op.in]: ['Aceite', 'Em Análise SLL'] } },
                include: [{ model: Badge, where: badgeWhere, required: true }, { model: Utilizador, where: utilizadorWhere, required: Object.keys(utilizadorWhere).length > 0 }]
            });
            const rejeitados = await Pedido.count({ 
                where: { ...baseWhere, ESTADO_PEDIDO: 'Recusado' },
                include: [{ model: Badge, where: badgeWhere, required: true }, { model: Utilizador, where: utilizadorWhere, required: Object.keys(utilizadorWhere).length > 0 }]
            });
            const pendentes = await Pedido.count({ 
                where: { ...baseWhere, ESTADO_PEDIDO: 'Pendente' },
                include: [{ model: Badge, where: badgeWhere, required: true }, { model: Utilizador, where: utilizadorWhere, required: Object.keys(utilizadorWhere).length > 0 }]
            });
            dadosRelatorio.taxaAprovacao = { aprovados, rejeitados, pendentes };
        }

        // 2. Ranking de Consultores
        if (opcoes.rankingConsultores) {
            const { getAllConsultorsStats } = require('../utils/pontosHelper');
            const estatisticas = await getAllConsultorsStats({}, utilizadorWhere);
            const top20 = estatisticas.slice(0, 20);

            dadosRelatorio.rankingConsultores = top20.map(s => ({
                nome: s.consultor.Utilizador?.NOME_COMPLETO_UTILIZADOR || 'Desconhecido',
                pontos: s.pontosCalculados
            }));
        }

        // Helper func to format Categorias
        const parseCategoria = (catStr) => {
            try { if (catStr.startsWith('{')) { const obj = JSON.parse(catStr); return `${obj.serviceLine || ''} - ${obj.area || ''}`; } } catch(e){}
            return catStr;
        };

        // 3. Badges Obtidos na Plataforma
        if (opcoes.badgesObtidos) {
            let baseWhere = {};
            if (dataWhere) baseWhere.DATA_ATRIBUICAO_BADGE = dataWhere;
            
            const badgesObtidos = await ConsultorBadge.findAll({
                where: baseWhere,
                include: [
                    { model: Consultor, include: [{ model: Utilizador, where: utilizadorWhere, required: Object.keys(utilizadorWhere).length > 0 }] },
                    { model: Badge, where: badgeWhere, required: true }
                ],
                order: [['DATA_ATRIBUICAO_BADGE', 'DESC']]
            });
            let listaMista = badgesObtidos.map(cb => ({
                consultor: cb.Consultor?.Utilizador?.NOME_COMPLETO_UTILIZADOR || 'Desconhecido',
                badge: cb.Badge?.NOME_BADGE || 'N/A',
                area: parseCategoria(cb.Badge?.CATEGORIA_BADGE || 'N/A'),
                pontos: cb.Badge?.PONTOS_BADGE || 0,
                dataRaw: cb.DATA_ATRIBUICAO_BADGE,
                data: new Date(cb.DATA_ATRIBUICAO_BADGE).toLocaleDateString('pt-PT')
            }));

            // Adicionar Badges Premium
            let baseWhereMarco = {};
            if (dataWhere) baseWhereMarco.DATA_CONQUISTA = dataWhere;
            
            const MarcoConsultor = require('../models/MarcoConsultor');
            const MarcoConquista = require('../models/MarcoConquista');
            const marcosGanhos = await MarcoConsultor.findAll({ where: baseWhereMarco });
            
            if (marcosGanhos.length > 0) {
                const todosMarcos = await MarcoConquista.findAll();
                const consultoresArr = await Consultor.findAll({
                    include: [{ model: Utilizador, where: utilizadorWhere, required: Object.keys(utilizadorWhere).length > 0 }]
                });
                const mapCons = {};
                consultoresArr.forEach(c => mapCons[c.ID_CONSULTOR] = c);

                marcosGanhos.forEach(mc => {
                    const cons = mapCons[mc.ID_CONSULTOR];
                    if (cons) {
                        if (filtros.sl && filtros.sl !== 'Todas' && cons.Utilizador?.SL_REGISTO !== filtros.sl) return;
                        if (filtros.area && filtros.area !== 'Todas' && cons.Utilizador?.AREA_REGISTO !== filtros.area) return;
                        const mk = todosMarcos.find(t => t.ID_MARCO === mc.ID_MARCO);
                        if (mk) {
                            listaMista.push({
                                consultor: cons.Utilizador?.NOME_COMPLETO_UTILIZADOR || 'Desconhecido',
                                badge: mk.TITULO_MARCO || 'Premium Badge',
                                area: 'Conquista Especial',
                                pontos: mk.PONTOS_EXTRA || 0,
                                dataRaw: mc.DATA_CONQUISTA,
                                data: new Date(mc.DATA_CONQUISTA).toLocaleDateString('pt-PT')
                            });
                        }
                    }
                });
            }

            listaMista.sort((a, b) => new Date(b.dataRaw) - new Date(a.dataRaw));

            dadosRelatorio.badgesObtidos = listaMista.map(({ dataRaw, ...rest }) => rest);
        }

        // 4. Pedidos Pendentes
        if (opcoes.pedidosPendentes) {
            let baseWhere = { ESTADO_PEDIDO: { [Op.in]: ['Pendente', 'Em Análise TM'] } };
            if (dataWhere) baseWhere.DATA_SUBMISSAO_PEDIDO = dataWhere;
            if (pedidoWhere.ID_PEDIDO) baseWhere.ID_PEDIDO = pedidoWhere.ID_PEDIDO;

            const pendentes = await Pedido.findAll({
                where: baseWhere,
                include: [
                    { model: Utilizador, where: utilizadorWhere, required: Object.keys(utilizadorWhere).length > 0 }, 
                    { model: Badge, where: badgeWhere, required: true }
                ],
                order: [['DATA_SUBMISSAO_PEDIDO', 'DESC']]
            });
            dadosRelatorio.pedidosPendentes = pendentes.map(p => ({
                id: `PED-${p.ID_PEDIDO}`,
                consultor: p.Utilizador?.NOME_COMPLETO_UTILIZADOR || 'N/A',
                badge: p.Badge?.NOME_BADGE || 'N/A',
                data: new Date(p.DATA_SUBMISSAO_PEDIDO).toLocaleDateString('pt-PT')
            }));
        }

        // Exportação integral de pedidos, independentemente do estado.
        if (opcoes.todosPedidos) {
            const baseWhere = {};
            if (dataWhere) baseWhere.DATA_SUBMISSAO_PEDIDO = dataWhere;
            if (pedidoWhere.ID_PEDIDO) baseWhere.ID_PEDIDO = pedidoWhere.ID_PEDIDO;
            const pedidos = await Pedido.findAll({
                where: baseWhere,
                include: [
                    { model: Utilizador, where: utilizadorWhere, required: Object.keys(utilizadorWhere).length > 0 },
                    { model: Badge, where: badgeWhere, required: true }
                ],
                order: [['DATA_SUBMISSAO_PEDIDO', 'DESC']]
            });
            dadosRelatorio.todosPedidos = pedidos.map(p => ({
                id: `PED-${p.ID_PEDIDO}`,
                consultor: p.Utilizador?.NOME_COMPLETO_UTILIZADOR || 'N/A',
                badge: p.Badge?.NOME_BADGE || 'N/A',
                estado: p.ESTADO_PEDIDO,
                submissao: new Date(p.DATA_SUBMISSAO_PEDIDO).toLocaleDateString('pt-PT'),
                ultimaAtualizacao: new Date(p.DATA_ULTIMA_ATUALIZACAO).toLocaleDateString('pt-PT')
            }));
        }

        // Catálogo de badges disponíveis, distinto dos badges já atribuídos.
        if (opcoes.catalogoBadges) {
            const badges = await Badge.findAll({
                where: badgeWhere,
                include: [{ model: Nivel }],
                order: [['NOME_BADGE', 'ASC']]
            });
            const catalogo = badges.map(b => {
                const categoria = parseCategoria(b.CATEGORIA_BADGE || 'N/A');
                const letra = String.fromCharCode(64 + (b.Nivel?.ORDEM_HIERARQUICA || 0));
                return {
                    id: b.ID_BADGE,
                    nome: b.NOME_BADGE,
                    categoria,
                    nivel: b.Nivel ? `${b.Nivel.NOME_NIVEL} (${letra})` : 'N/A',
                    pontos: b.PONTOS_BADGE || 0,
                    validade: b.VALIDADE_MESES ? `${b.VALIDADE_MESES} meses` : 'Sem expiração'
                };
            });
            if ((!filtros.sl || filtros.sl === 'Todas') && (!filtros.area || filtros.area === 'Todas')) {
                const premium = await MarcoConquista.findAll({ order: [['TITULO_MARCO', 'ASC']] });
                catalogo.push(...premium.map(m => ({
                    id: `PREM-${m.ID_MARCO}`,
                    nome: m.TITULO_MARCO,
                    categoria: 'Conquista Especial',
                    nivel: 'Premium',
                    pontos: m.PONTOS_EXTRA || 0,
                    validade: 'Sem expiração'
                })));
            }
            dadosRelatorio.catalogoBadges = catalogo;
        }

        // 5. Histórico de Decisões
        if (opcoes.historicoDecisoes) {
            let baseWhere = { ESTADO_PEDIDO: { [Op.ne]: 'Pendente' } };
            if (dataWhere) baseWhere.DATA_ULTIMA_ATUALIZACAO = dataWhere;
            if (pedidoWhere.ID_PEDIDO) baseWhere.ID_PEDIDO = pedidoWhere.ID_PEDIDO;

            const historico = await Pedido.findAll({
                where: baseWhere,
                include: [
                    { model: Utilizador, where: utilizadorWhere, required: Object.keys(utilizadorWhere).length > 0 }, 
                    { model: Badge, where: badgeWhere, required: true }
                ],
                order: [['DATA_ULTIMA_ATUALIZACAO', 'DESC']]
            });
            dadosRelatorio.historicoDecisoes = historico.map(p => ({
                id: `PED-${p.ID_PEDIDO}`,
                consultor: p.Utilizador?.NOME_COMPLETO_UTILIZADOR || 'N/A',
                badge: p.Badge?.NOME_BADGE || 'N/A',
                status: p.ESTADO_PEDIDO,
                data: new Date(p.DATA_ULTIMA_ATUALIZACAO).toLocaleDateString('pt-PT')
            }));
        }

        // 6. Badges em Expiração
        if (opcoes.badgesExpiracao) {
            let baseWhere = { DATA_EXPIRACAO: { [Op.not]: null, [Op.gt]: new Date() } };
            if (dataWhere) baseWhere.DATA_EXPIRACAO = { [Op.not]: null, ...dataWhere };

            const expiracoes = await ConsultorBadge.findAll({
                where: baseWhere,
                include: [
                    { model: Consultor, include: [{ model: Utilizador, where: utilizadorWhere, required: Object.keys(utilizadorWhere).length > 0 }] }, 
                    { model: Badge, where: badgeWhere, required: true }
                ],
                order: [['DATA_EXPIRACAO', 'ASC']]
            });
            dadosRelatorio.badgesExpiracao = expiracoes.map(cb => ({
                consultor: cb.Consultor?.Utilizador?.NOME_COMPLETO_UTILIZADOR || 'N/A',
                badge: cb.Badge?.NOME_BADGE || 'N/A',
                expiraEm: new Date(cb.DATA_EXPIRACAO).toLocaleDateString('pt-PT')
            }));
        }

        // --- REGISTAR A AÇÃO DE EXPORTAÇÃO NO LOG (Auditoria) ---
        if(idUtilizadorAtivo) {
            await LogExportacao.create({
                ID_UTILIZADOR: idUtilizadorAtivo,
                TIPO_FICHEIRO: formatoExportacao || 'ND',
                FILTROS_APLICADOS: JSON.stringify(filtros)
            });
        }

        res.json({ success: true, data: dadosRelatorio });
    } catch (error) {
        console.error("ERRO GERAR RELATORIO TM:", error);
        res.status(500).json({ success: false, message: error.message });
    }
};

// =========================================================================
// MÉTODOS DO SERVICE LINE LEADER (SLL)
// =========================================================================

controllers.gerarRelatorioSLL = async (req, res) => {
    try {
        const { filtros, opcoes, idUtilizadorAtivo, formatoExportacao, serviceLineSLL } = req.body;
        const serviceLineAtiva = await obterServiceLineSLL(req.userId, serviceLineSLL);
        let dadosRelatorio = {};

        if (!serviceLineAtiva) return res.status(400).json({ success: false, message: "SL não identificada." });

        // === CONSTRUÇÃO DE FILTROS ===
        let badgeWhere = {};
        let andConditions = [{ [Op.like]: `%"serviceLine":"${serviceLineAtiva}"%` }]; // Forçar a SL sempre
        if (filtros.area && filtros.area !== 'Todas') andConditions.push({ [Op.like]: `%"area":"${filtros.area}"%` });
        badgeWhere.CATEGORIA_BADGE = { [Op.and]: andConditions };

        if (filtros.niveis && filtros.niveis.length > 0 && !filtros.niveis.includes('Todos')) {
            const ordemPorLetra = { A: 1, B: 2, C: 3, D: 4, E: 5 };
            const niveis = await Nivel.findAll({
                where: {
                    ORDEM_HIERARQUICA: {
                        [Op.in]: filtros.niveis.map(n => ordemPorLetra[n]).filter(Boolean)
                    }
                },
                attributes: ['ID_NIVEL']
            });
            badgeWhere.ID_NIVEL = { [Op.in]: niveis.map(n => n.ID_NIVEL) };
        }

        let utilizadorWhere = {};
        if (filtros.pesquisa && filtros.pesquisa.trim() !== '') {
            utilizadorWhere.NOME_COMPLETO_UTILIZADOR = { [Op.like]: `%${filtros.pesquisa}%` };
        }

        let dataWhere = null;
        if (filtros.periodo && filtros.periodo !== 'Todos') {
            let dataMin = new Date();
            let dataMax = null;
            if (filtros.periodo === '3') Object.assign(dataMin, { month: dataMin.setMonth(dataMin.getMonth() - 3) });
            else if (filtros.periodo === '6') Object.assign(dataMin, { month: dataMin.setMonth(dataMin.getMonth() - 6) });
            else if (filtros.periodo === 'Personalizado') {
                dataMin = filtros.dataInicio ? new Date(filtros.dataInicio) : null;
                dataMax = filtros.dataFim ? new Date(filtros.dataFim) : null;
                if (dataMax) dataMax.setHours(23, 59, 59, 999);
            }
            if (dataMin && dataMax) dataWhere = { [Op.between]: [dataMin, dataMax] };
            else if (dataMin) dataWhere = { [Op.gte]: dataMin };
            else if (dataMax) dataWhere = { [Op.lte]: dataMax };
        }

        // Helper func to format Categorias
        const parseCategoria = (catStr) => {
            try { if (catStr.startsWith('{')) { const obj = JSON.parse(catStr); return `${obj.serviceLine || ''} - ${obj.area || ''}`; } } catch(e){}
            return catStr;
        };

        // 1. Métricas de Aprovação / Rejeição (Desta SL)
        if (opcoes.taxas) {
            let baseWhere = {};
            if (dataWhere) baseWhere.DATA_SUBMISSAO_PEDIDO = dataWhere;

            const aprovados = await Pedido.count({ 
                where: { ...baseWhere, ESTADO_PEDIDO: 'Aceite' },
                include: [{ model: Badge, where: badgeWhere, required: true }, { model: Utilizador, where: utilizadorWhere, required: Object.keys(utilizadorWhere).length > 0 }]
            });
            const rejeitados = await Pedido.count({ 
                where: { ...baseWhere, ESTADO_PEDIDO: 'Recusado', ID_SLL: { [Op.ne]: null } },
                include: [{ model: Badge, where: badgeWhere, required: true }, { model: Utilizador, where: utilizadorWhere, required: Object.keys(utilizadorWhere).length > 0 }]
            });
            const pendentes = await Pedido.count({ 
                where: { ...baseWhere, ESTADO_PEDIDO: 'Em Análise SLL' },
                include: [{ model: Badge, where: badgeWhere, required: true }, { model: Utilizador, where: utilizadorWhere, required: Object.keys(utilizadorWhere).length > 0 }]
            });
            dadosRelatorio.taxas = { aprovados, rejeitados, pendentes };
        }

        // 2. Ranking Seguro 
        if (opcoes.ranking) {
            // O ranking conta os pontos totais na Service Line (sem limite de datas para simplificar o ranking geral, mas com os filtros de área e nível aplicados)
            const todosConsultores = await Consultor.findAll({
                include: [{
                    model: Utilizador,
                    where: { ...utilizadorWhere, SL_REGISTO: serviceLineAtiva },
                    required: true
                }]
            });
            
            let cbWhere = {};
            if (dataWhere) cbWhere.DATA_ATRIBUICAO_BADGE = dataWhere;

            const todosBadgesSL = await ConsultorBadge.findAll({ 
                where: cbWhere,
                include: [{ model: Badge, where: badgeWhere, required: true }] 
            });
            
            let todosMarcosSL = [];
            // Só incluímos marcos premium se não houver filtro estrito de área/nível (os marcos não têm área/nível)
            if ((!filtros.area || filtros.area === 'Todas') && (!filtros.niveis || filtros.niveis.length === 0 || filtros.niveis.includes('Todos'))) {
                let mcWhere = {};
                if (dataWhere) mcWhere.DATA_CONQUISTA = dataWhere;
                todosMarcosSL = await MarcoConsultor.findAll({
                    where: mcWhere,
                    include: [{ model: MarcoConquista, as: 'MarcoConquista', required: true }]
                });
            }
            
            const listaRankingBruta = todosConsultores.map(c => {
                const badgesDesteConsultor = todosBadgesSL.filter(cb => cb.ID_CONSULTOR === c.ID_CONSULTOR);
                const marcosDesteConsultor = todosMarcosSL.filter(mc => mc.ID_CONSULTOR === c.ID_CONSULTOR);

                if (badgesDesteConsultor.length === 0 && marcosDesteConsultor.length === 0) return null;

                let pontosTotais = badgesDesteConsultor.reduce((soma, cb) => soma + (cb.Badge?.PONTOS_BADGE || 0), 0);
                pontosTotais += marcosDesteConsultor.reduce((soma, mc) => soma + (mc.MarcoConquista?.PONTOS_EXTRA || 0), 0);
                
                return {
                    nome: c.Utilizador?.NOME_COMPLETO_UTILIZADOR || 'Anónimo',
                    pontos: pontosTotais
                };
            }).filter(item => item !== null);

            dadosRelatorio.ranking = listaRankingBruta.sort((a,b) => b.pontos - a.pontos);
        }

        if (opcoes.evolucao) {
            const consultoresSL = await Consultor.findAll({
                include: [{ model: Utilizador, where: { SL_REGISTO: serviceLineAtiva }, required: true }]
            });
            const idsConsultores = consultoresSL.map(c => c.ID_CONSULTOR);
            const badges = idsConsultores.length ? await ConsultorBadge.findAll({
                where: { ID_CONSULTOR: { [Op.in]: idsConsultores } },
                include: [{ model: Badge }]
            }) : [];
            const marcos = idsConsultores.length ? await MarcoConsultor.findAll({
                where: { ID_CONSULTOR: { [Op.in]: idsConsultores } },
                include: [{ model: MarcoConquista, as: 'MarcoConquista', required: true }]
            }) : [];
            const evolucao = [];
            for (let i = 5; i >= 0; i--) {
                const base = new Date();
                base.setMonth(base.getMonth() - i);
                const inicio = new Date(base.getFullYear(), base.getMonth(), 1);
                const fim = new Date(base.getFullYear(), base.getMonth() + 1, 0, 23, 59, 59, 999);
                const pontosBadges = badges
                    .filter(cb => new Date(cb.DATA_ATRIBUICAO_BADGE) >= inicio && new Date(cb.DATA_ATRIBUICAO_BADGE) <= fim)
                    .reduce((total, cb) => total + (cb.Badge?.PONTOS_BADGE || 0), 0);
                const pontosPremium = marcos
                    .filter(mc => new Date(mc.DATA_CONQUISTA) >= inicio && new Date(mc.DATA_CONQUISTA) <= fim)
                    .reduce((total, mc) => total + (mc.MarcoConquista?.PONTOS_EXTRA || 0), 0);
                evolucao.push({
                    mes: base.toLocaleDateString('pt-PT', { month: 'short', year: 'numeric' }),
                    pontos: pontosBadges + pontosPremium
                });
            }
            dadosRelatorio.evolucao = evolucao;
        }

        // 3. Badges Obtidos na Área
        if (opcoes.badges) {
            let baseWhere = {};
            if (dataWhere) baseWhere.DATA_ATRIBUICAO_BADGE = dataWhere;

            const historicoBadges = await ConsultorBadge.findAll({
                where: baseWhere,
                include: [
                    { model: Consultor, include: [{ model: Utilizador, where: utilizadorWhere, required: Object.keys(utilizadorWhere).length > 0 }] },
                    { model: Badge, where: badgeWhere, required: true }
                ],
                order: [['DATA_ATRIBUICAO_BADGE', 'DESC']]
            });
            
            let badgesLista = historicoBadges.map(cb => ({
                consultor: cb.Consultor?.Utilizador?.NOME_COMPLETO_UTILIZADOR || 'N/A',
                badge: cb.Badge?.NOME_BADGE || 'N/A',
                data: new Date(cb.DATA_ATRIBUICAO_BADGE).toLocaleDateString('pt-PT')
            }));

            if ((!filtros.area || filtros.area === 'Todas') && (!filtros.niveis || filtros.niveis.length === 0 || filtros.niveis.includes('Todos'))) {
                let mcWhere = {};
                if (dataWhere) mcWhere.DATA_CONQUISTA = dataWhere;
                const historicoMarcos = await MarcoConsultor.findAll({
                    where: mcWhere,
                    include: [
                        { model: Consultor, include: [{ model: Utilizador, where: utilizadorWhere, required: Object.keys(utilizadorWhere).length > 0 }] },
                        { model: MarcoConquista, as: 'MarcoConquista', required: true }
                    ],
                    order: [['DATA_CONQUISTA', 'DESC']]
                });
                const marcosLista = historicoMarcos
                    .filter(mc => mc.Consultor?.Utilizador?.SL_REGISTO === serviceLineAtiva)
                    .map(mc => ({
                    consultor: mc.Consultor?.Utilizador?.NOME_COMPLETO_UTILIZADOR || 'N/A',
                    badge: `(Premium) ${mc.MarcoConquista?.TITULO_MARCO || 'N/A'}`,
                    data: new Date(mc.DATA_CONQUISTA).toLocaleDateString('pt-PT')
                }));
                badgesLista = [...badgesLista, ...marcosLista];
            }

            dadosRelatorio.badges = badgesLista;
        }

        // 4. Pedidos Pendentes (Decisões do Líder)
        if (opcoes.pendentes) {
            let baseWhere = { ESTADO_PEDIDO: 'Em Análise SLL' };
            if (dataWhere) baseWhere.DATA_SUBMISSAO_PEDIDO = dataWhere;

            const pendentes = await Pedido.findAll({
                where: baseWhere,
                include: [
                    { model: Utilizador, where: utilizadorWhere, required: Object.keys(utilizadorWhere).length > 0 }, 
                    { model: Badge, where: badgeWhere, required: true }
                ],
                order: [['DATA_SUBMISSAO_PEDIDO', 'DESC']]
            });
            dadosRelatorio.pendentes = pendentes.map(p => ({
                consultor: p.Utilizador?.NOME_COMPLETO_UTILIZADOR,
                badge: p.Badge?.NOME_BADGE,
                data: new Date(p.DATA_SUBMISSAO_PEDIDO).toLocaleDateString('pt-PT')
            }));
        }

        // 5. Histórico de Decisões
        if (opcoes.historico) {
            let baseWhere = {
                ESTADO_PEDIDO: { [Op.in]: ['Aceite', 'Recusado', 'Rascunho'] },
                ID_SLL: { [Op.ne]: null }
            };
            if (dataWhere) baseWhere.DATA_ULTIMA_ATUALIZACAO = dataWhere;

            const historico = await Pedido.findAll({
                where: baseWhere,
                include: [
                    { model: Utilizador, where: utilizadorWhere, required: Object.keys(utilizadorWhere).length > 0 }, 
                    { model: Badge, where: badgeWhere, required: true }
                ],
                order: [['DATA_ULTIMA_ATUALIZACAO', 'DESC']]
            });
            dadosRelatorio.historico = historico.map(p => ({
                consultor: p.Utilizador?.NOME_COMPLETO_UTILIZADOR,
                badge: p.Badge?.NOME_BADGE,
                status: p.ESTADO_PEDIDO === 'Rascunho' ? 'Envio de volta' : p.ESTADO_PEDIDO,
                data: new Date(p.DATA_ULTIMA_ATUALIZACAO).toLocaleDateString('pt-PT')
            }));
        }

        // 6. Badges em Expiração
        if (opcoes.expiracao) {
            let baseWhere = { DATA_EXPIRACAO: { [Op.not]: null, [Op.gt]: new Date() } };
            if (dataWhere) baseWhere.DATA_EXPIRACAO = { [Op.not]: null, ...dataWhere };

            const expiracoes = await ConsultorBadge.findAll({
                where: baseWhere,
                include: [
                    { model: Consultor, include: [{ model: Utilizador, where: utilizadorWhere, required: Object.keys(utilizadorWhere).length > 0 }] }, 
                    { model: Badge, where: badgeWhere, required: true }
                ],
                order: [['DATA_EXPIRACAO', 'ASC']]
            });

            dadosRelatorio.expiracao = expiracoes.map(cb => ({
                consultor: cb.Consultor?.Utilizador?.NOME_COMPLETO_UTILIZADOR || 'N/A',
                badge: cb.Badge?.NOME_BADGE || 'N/A',
                expiraEm: new Date(cb.DATA_EXPIRACAO).toLocaleDateString('pt-PT')
            }));
        }

        if (opcoes.todosPedidos) {
            const wherePedidos = {};
            if (dataWhere) wherePedidos.DATA_SUBMISSAO_PEDIDO = dataWhere;
            const pedidos = await Pedido.findAll({
                where: wherePedidos,
                include: [
                    { model: Utilizador, where: utilizadorWhere, required: Object.keys(utilizadorWhere).length > 0 },
                    { model: Badge, where: badgeWhere, required: true }
                ],
                order: [['DATA_SUBMISSAO_PEDIDO', 'DESC']]
            });
            dadosRelatorio.todosPedidos = pedidos.map(p => ({
                id: `PED-${p.ID_PEDIDO}`,
                consultor: p.Utilizador?.NOME_COMPLETO_UTILIZADOR || 'N/A',
                badge: p.Badge?.NOME_BADGE || 'N/A',
                estado: p.ESTADO_PEDIDO,
                submissao: new Date(p.DATA_SUBMISSAO_PEDIDO).toLocaleDateString('pt-PT'),
                atualizacao: new Date(p.DATA_ULTIMA_ATUALIZACAO).toLocaleDateString('pt-PT')
            }));
        }

        if (opcoes.catalogo) {
            const badgesCatalogo = await Badge.findAll({
                where: badgeWhere,
                include: [{ model: Nivel }],
                order: [['NOME_BADGE', 'ASC']]
            });
            const catalogo = badgesCatalogo.map(b => {
                const ordem = b.Nivel?.ORDEM_HIERARQUICA;
                return {
                    id: b.ID_BADGE,
                    nome: b.NOME_BADGE,
                    categoria: parseCategoria(b.CATEGORIA_BADGE || serviceLineAtiva),
                    nivel: b.Nivel && ordem ? `${b.Nivel.NOME_NIVEL} (${String.fromCharCode(64 + ordem)})` : 'N/A',
                    pontos: b.PONTOS_BADGE || 0,
                    validade: b.VALIDADE_MESES ? `${b.VALIDADE_MESES} meses` : 'Sem expiração'
                };
            });
            if ((!filtros.area || filtros.area === 'Todas') &&
                (!filtros.niveis || filtros.niveis.length === 0 || filtros.niveis.includes('Todos'))) {
                const premium = await MarcoConquista.findAll({ order: [['TITULO_MARCO', 'ASC']] });
                catalogo.push(...premium.map(m => ({
                    id: `PREM-${m.ID_MARCO}`,
                    nome: m.TITULO_MARCO,
                    categoria: 'Conquista Especial',
                    nivel: 'Premium',
                    pontos: m.PONTOS_EXTRA || 0,
                    validade: 'Sem expiração'
                })));
            }
            dadosRelatorio.catalogo = catalogo;
        }

        // --- REGISTAR NO LOG ---
        await LogExportacao.create({
            ID_UTILIZADOR: idUtilizadorAtivo,
            TIPO_FICHEIRO: formatoExportacao,
            FILTROS_APLICADOS: JSON.stringify({ ...filtros, serviceLine: serviceLineAtiva })
        });

        res.json({ success: true, data: dadosRelatorio });
    } catch (error) {
        console.error("ERRO RELATORIO SLL:", error);
        res.status(500).json({ success: false, message: error.message });
    }
};

// =========================================================================
// MÉTODOS DO ADMINISTADOR
// =========================================================================

controllers.gerarRelatorioAdmin = async (req, res) => {
    try {
        const { filtros, opcoes, idUtilizadorAtivo, formatoExportacao } = req.body;
        let dadosRelatorio = {};

        // === 1. CONSTRUÇÃO DE FILTROS ===
        let badgeWhere = {};
        let andConditions = [];
        if (filtros.serviceLineFilter && filtros.serviceLineFilter !== 'Todas') andConditions.push({ [Op.like]: `%"serviceLine":"${filtros.serviceLineFilter}"%` });
        if (filtros.areaFilter && filtros.areaFilter !== 'Todas') andConditions.push({ [Op.like]: `%"area":"${filtros.areaFilter}"%` });
        
        if (andConditions.length > 0) badgeWhere.CATEGORIA_BADGE = { [Op.and]: andConditions };

        let utilizadorWhere = {};
        if (filtros.pesquisa && filtros.pesquisa.trim() !== '') {
            utilizadorWhere.NOME_COMPLETO_UTILIZADOR = { [Op.like]: `%${filtros.pesquisa}%` };
        }

        let dataWhere = null;
        if (filtros.periodoTempo && filtros.periodoTempo !== 'Todos') {
            let dataMin = new Date();
            let dataMax = null;
            if (filtros.periodoTempo === 'Últimos 3 meses') Object.assign(dataMin, { month: dataMin.setMonth(dataMin.getMonth() - 3) });
            else if (filtros.periodoTempo === 'Últimos 6 meses') Object.assign(dataMin, { month: dataMin.setMonth(dataMin.getMonth() - 6) });
            else if (filtros.periodoTempo === 'Ano Corrente') {
                dataMin = new Date(new Date().getFullYear(), 0, 1);
            }
            if (filtros.dataInicio) dataMin = new Date(filtros.dataInicio);
            if (filtros.dataFim) {
                dataMax = new Date(filtros.dataFim);
                dataMax.setHours(23, 59, 59, 999);
            }

            if (dataMin && dataMax) dataWhere = { [Op.between]: [dataMin, dataMax] };
            else if (dataMin) dataWhere = { [Op.gte]: dataMin };
            else if (dataMax) dataWhere = { [Op.lte]: dataMax };
        }

        const parseCategoria = (catStr) => {
            try { if (catStr && catStr.startsWith('{')) { const obj = JSON.parse(catStr); return `${obj.serviceLine || ''} - ${obj.area || ''}`; } } catch(e){}
            return catStr;
        };

        const hasUtilizadorFilter = Object.keys(utilizadorWhere).length > 0;
        const hasBadgeFilter = Object.keys(badgeWhere).length > 0;

        // 1. Taxas Globais
        if (opcoes.taxas_globais) {
            let baseWhere = {};
            if (dataWhere) baseWhere.DATA_SUBMISSAO_PEDIDO = dataWhere;

            const aprovados = await Pedido.count({ 
                where: { ...baseWhere, ESTADO_PEDIDO: { [Op.in]: ['Aceite', 'Em Análise SLL'] } },
                include: [{ model: Badge, where: badgeWhere, required: hasBadgeFilter }, { model: Utilizador, where: utilizadorWhere, required: hasUtilizadorFilter }]
            });
            const rejeitados = await Pedido.count({ 
                where: { ...baseWhere, ESTADO_PEDIDO: 'Recusado' },
                include: [{ model: Badge, where: badgeWhere, required: hasBadgeFilter }, { model: Utilizador, where: utilizadorWhere, required: hasUtilizadorFilter }]
            });
            const pendentes = await Pedido.count({ 
                where: { ...baseWhere, ESTADO_PEDIDO: 'Pendente' },
                include: [{ model: Badge, where: badgeWhere, required: hasBadgeFilter }, { model: Utilizador, where: utilizadorWhere, required: hasUtilizadorFilter }]
            });
            dadosRelatorio.taxasGlobais = { aprovados, rejeitados, pendentes };
        }

        // 2. Ranking Global
        if (opcoes.ranking_global) {
            const { getAllConsultorsStats } = require('../utils/pontosHelper');
            const estatisticas = await getAllConsultorsStats({}, utilizadorWhere);

            dadosRelatorio.rankingGlobal = estatisticas.map(s => ({
                nome: s.consultor.Utilizador?.NOME_COMPLETO_UTILIZADOR || 'Desconhecido',
                pontos: s.pontosCalculados
            }));
        }

        // 3. Badges Obtidos
        if (opcoes.badges_obtidos) {
            let baseWhere = {};
            if (dataWhere) baseWhere.DATA_ATRIBUICAO_BADGE = dataWhere;

            const badgesObtidos = await ConsultorBadge.findAll({
                where: baseWhere,
                include: [
                    { model: Consultor, include: [{ model: Utilizador, where: utilizadorWhere, required: hasUtilizadorFilter }] },
                    { model: Badge, where: badgeWhere, required: hasBadgeFilter }
                ],
                order: [['DATA_ATRIBUICAO_BADGE', 'DESC']]
            });
            dadosRelatorio.badgesObtidos = badgesObtidos.map(cb => ({
                consultor: cb.Consultor?.Utilizador?.NOME_COMPLETO_UTILIZADOR || 'N/A',
                badge: cb.Badge?.NOME_BADGE || 'N/A',
                area: parseCategoria(cb.Badge?.CATEGORIA_BADGE || 'N/A'),
                data: new Date(cb.DATA_ATRIBUICAO_BADGE).toLocaleDateString('pt-PT')
            }));
        }

        // 4. Pedidos Pendentes
        if (opcoes.pedidos_pendentes) {
            let baseWhere = { ESTADO_PEDIDO: { [Op.in]: ['Pendente', 'Em Análise TM'] } };
            if (dataWhere) baseWhere.DATA_SUBMISSAO_PEDIDO = dataWhere;

            const pendentes = await Pedido.findAll({
                where: baseWhere,
                include: [
                    { model: Utilizador, where: utilizadorWhere, required: hasUtilizadorFilter }, 
                    { model: Badge, where: badgeWhere, required: hasBadgeFilter }
                ],
                order: [['DATA_SUBMISSAO_PEDIDO', 'DESC']]
            });
            dadosRelatorio.pedidosPendentes = pendentes.map(p => ({
                id: `PED-${p.ID_PEDIDO}`,
                consultor: p.Utilizador?.NOME_COMPLETO_UTILIZADOR || 'N/A',
                badge: p.Badge?.NOME_BADGE || 'N/A',
                data: new Date(p.DATA_SUBMISSAO_PEDIDO).toLocaleDateString('pt-PT')
            }));
        }

        // 5. Histórico de Decisões
        if (opcoes.decisoes_sll) {
            let baseWhere = { ESTADO_PEDIDO: { [Op.ne]: 'Pendente' } };
            if (dataWhere) baseWhere.DATA_ULTIMA_ATUALIZACAO = dataWhere;

            const historico = await Pedido.findAll({
                where: baseWhere,
                include: [
                    { model: Utilizador, where: utilizadorWhere, required: hasUtilizadorFilter }, 
                    { model: Badge, where: badgeWhere, required: hasBadgeFilter }
                ],
                order: [['DATA_ULTIMA_ATUALIZACAO', 'DESC']]
            });
            dadosRelatorio.historicoDecisoes = historico.map(p => ({
                id: `PED-${p.ID_PEDIDO}`,
                consultor: p.Utilizador?.NOME_COMPLETO_UTILIZADOR || 'N/A',
                badge: p.Badge?.NOME_BADGE || 'N/A',
                status: p.ESTADO_PEDIDO,
                data: new Date(p.DATA_ULTIMA_ATUALIZACAO).toLocaleDateString('pt-PT')
            }));
        }

        // 6. Expiração Global
        if (opcoes.expiracao_global) {
            let baseWhere = { DATA_EXPIRACAO: { [Op.not]: null, [Op.gt]: new Date() } };
            if (dataWhere) baseWhere.DATA_EXPIRACAO = { [Op.not]: null, ...dataWhere };

            const expiracoes = await ConsultorBadge.findAll({
                where: baseWhere,
                include: [
                    { model: Consultor, include: [{ model: Utilizador, where: utilizadorWhere, required: hasUtilizadorFilter }] }, 
                    { model: Badge, where: badgeWhere, required: hasBadgeFilter }
                ],
                order: [['DATA_EXPIRACAO', 'ASC']]
            });
            dadosRelatorio.expiracaoGlobal = expiracoes.map(cb => ({
                consultor: cb.Consultor?.Utilizador?.NOME_COMPLETO_UTILIZADOR || 'N/A',
                badge: cb.Badge?.NOME_BADGE || 'N/A',
                expiraEm: new Date(cb.DATA_EXPIRACAO).toLocaleDateString('pt-PT')
            }));
        }

        // 7. Evolução Pontos
        if (opcoes.evolucao_pontos) {
            const HistoricoPontuacao = require('../models/HistoricoPontuacao');
            let baseWhere = {};
            if (dataWhere) baseWhere.DATA_ATRIBUICAO = dataWhere;

            const historico = await HistoricoPontuacao.findAll({
                where: baseWhere,
                include: [{ model: Utilizador, where: utilizadorWhere, required: hasUtilizadorFilter }],
                order: [['DATA_ATRIBUICAO', 'DESC']]
            });
            dadosRelatorio.evolucaoPontos = historico.map(h => ({
                consultor: h.Utilizador?.NOME_COMPLETO_UTILIZADOR || 'N/A',
                pontos: h.PONTOS_OBTIDOS,
                motivo: h.ORIGEM_PONTOS,
                data: new Date(h.DATA_ATRIBUICAO).toLocaleDateString('pt-PT')
            }));
        }

        // 8. Log Acessos (Auditoria de Exportações como proxy)
        if (opcoes.log_acessos) {
            let baseWhere = {};
            if (dataWhere) baseWhere.DATA_GERACAO = dataWhere;

            const logs = await LogExportacao.findAll({
                where: baseWhere,
                include: [{ model: Utilizador, where: utilizadorWhere, required: hasUtilizadorFilter }],
                order: [['DATA_GERACAO', 'DESC']]
            });
            dadosRelatorio.logAcessos = logs.map(l => ({
                admin: l.Utilizador?.NOME_COMPLETO_UTILIZADOR || 'N/A',
                tipo: l.TIPO_FICHEIRO,
                data: new Date(l.DATA_GERACAO).toLocaleString('pt-PT')
            }));
        }

        // --- REGISTAR LOG ---
        if(idUtilizadorAtivo) {
            await LogExportacao.create({
                ID_UTILIZADOR: idUtilizadorAtivo,
                TIPO_FICHEIRO: formatoExportacao || 'ND',
                FILTROS_APLICADOS: JSON.stringify(filtros)
            });
        }

        res.json({ success: true, data: dadosRelatorio });
    } catch (error) {
        console.error("ERRO GERAR RELATORIO ADMIN:", error);
        res.status(500).json({ success: false, message: error.message });
    }
};

module.exports = controllers;
