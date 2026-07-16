const Consultor = require('../models/Consultor');
const Utilizador = require('../models/Utilizador');
const ConsultorBadge = require('../models/ConsultorBadge');
const Badge = require('../models/Badge');
const MarcoConsultor = require('../models/MarcoConsultor');
const Area = require('../models/Area');
const ServiceLine = require('../models/ServiceLine');
const HistoricoPontuacao = require('../models/HistoricoPontuacao');
const { Op } = require('sequelize');
const { obterServiceLineSLL } = require('../utils/sllServiceLineHelper');

const controllers = {};

// =========================================================================
// MÉTODOS DO CONSULTOR
// =========================================================================

controllers.getDashboardConsultor = async (req, res) => {
    try {
        const { idUtilizador } = req.params;

        const todosConsultores = await Consultor.findAll({
            include: [{ model: Utilizador }]
        });

        const MarcoConsultor = require('../models/MarcoConsultor');
        const MarcoConquista = require('../models/MarcoConquista');
        
        const todosCb = await ConsultorBadge.findAll({ include: [{ model: Badge }] });
        const todosMcRaw = await MarcoConsultor.findAll();
        const todosMarcosRaw = await MarcoConquista.findAll({ attributes: ['ID_MARCO', 'PONTOS_EXTRA'] });

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

        let meuRanking = 0;
        let meusPontos = 0;

        const rankingList = todosConsultores.map((c, index) => {
            if (c.ID_UTILIZADOR == idUtilizador) {
                meuRanking = index + 1;
                meusPontos = c.pontosCalculados;
            }
            return {
                pos: index + 1,
                nome: c.Utilizador?.NOME_COMPLETO_UTILIZADOR || 'Desconhecido',
                pontos: c.pontosCalculados,
                badges: c.badgesCalculados,
                serviceLine: c.Utilizador?.SL_REGISTO || 'Geral',
                area: c.Utilizador?.AREA_REGISTO || 'Geral',
                isMe: c.ID_UTILIZADOR == idUtilizador,
                idConsultor: c.ID_CONSULTOR
            };
        });

        const top5 = rankingList.slice(0, 5);

        const consultorAtual = todosConsultores.find(c => c.ID_UTILIZADOR == idUtilizador);
        const totalBadgesBD = await Badge.count();
        const totalMarcosBD = await MarcoConquista.count();
        const totalGeral = totalBadgesBD + totalMarcosBD;
        const meusBadgesConcluidos = consultorAtual ? (cbMap[consultorAtual.ID_CONSULTOR]?.badgesCount || 0) : 0;
        const percentagem = totalGeral > 0 ? Math.round((meusBadgesConcluidos / totalGeral) * 100) : 0;

        const mesesLabels = [];
        const dadosLinha = [];
        const dadosNormais = [];
        const dadosEspeciais = [];

        for (let i = 5; i >= 0; i--) {
            const dataBase = new Date();
            dataBase.setMonth(dataBase.getMonth() - i);
            const nomeMes = dataBase.toLocaleString('pt-PT', { month: 'short' });
            mesesLabels.push(nomeMes.charAt(0).toUpperCase() + nomeMes.slice(1));

            const mesStart = new Date(dataBase.getFullYear(), dataBase.getMonth(), 1);
            const mesEnd = new Date(dataBase.getFullYear(), dataBase.getMonth() + 1, 0);

            let pontosMes = 0;
            let badgesMes = 0;
            let marcosMes = 0;

            if (consultorAtual) {
                const cbMes = await ConsultorBadge.findAll({
                    where: { ID_CONSULTOR: consultorAtual.ID_CONSULTOR, DATA_ATRIBUICAO_BADGE: { [Op.between]: [mesStart, mesEnd] } },
                    include: [{ model: Badge }]
                });
                badgesMes = cbMes.length;
                pontosMes += cbMes.reduce((acc, cb) => acc + (cb.Badge?.PONTOS_BADGE || 0), 0);

                const mcMes = await MarcoConsultor.findAll({
                    where: { ID_CONSULTOR: consultorAtual.ID_CONSULTOR, DATA_CONQUISTA: { [Op.between]: [mesStart, mesEnd] } }
                });
                marcosMes = mcMes.length;
                mcMes.forEach(mc => {
                    const marco = todosMarcosRaw.find(m => m.ID_MARCO == mc.ID_MARCO);
                    if (marco) pontosMes += marco.PONTOS_EXTRA;
                });
            }

            dadosLinha.push(pontosMes);
            dadosNormais.push(badgesMes);
            dadosEspeciais.push(marcosMes);
        }

        const mesPassadoPts = dadosLinha[4];
        const mesAtualPts = dadosLinha[5];
        let crescimentoStr = "0";
        if (mesPassadoPts > 0) {
            const calc = Math.round(((mesAtualPts - mesPassadoPts) / mesPassadoPts) * 100);
            crescimentoStr = calc > 0 ? `+${calc}` : `${calc}`;
        } else if (mesAtualPts > 0) {
            crescimentoStr = "+100";
        }

        res.json({
            success: true,
            data: {
                kpis: {
                    ranking: meuRanking,
                    totalConsultores: todosConsultores.length,
                    pontos: meusPontos,
                    crescimentoPontos: crescimentoStr,
                    percentagemBadges: percentagem
                },
                graficoLinha: { labels: mesesLabels, data: dadosLinha },
                graficoBarras: { labels: mesesLabels.slice(2, 6), normais: dadosNormais.slice(2, 6), especiais: dadosEspeciais.slice(2, 6) },
                top5: top5,
                rankingCompleto: rankingList
            }
        });

    } catch (error) {
        console.error("ERRO DASHBOARD:", error);
        res.status(500).json({ success: false, message: 'Ocorreu um erro inesperado. Tente novamente mais tarde.' });
    }
};

controllers.getEstatisticasDetalhadas = async (req, res) => {
    try {
        const { idUtilizador } = req.params;
        const consultorAtual = await Consultor.findOne({ where: { ID_UTILIZADOR: idUtilizador } });
        
        if (!consultorAtual) return res.status(404).json({ success: false, message: "Consultor não encontrado" });

        const meusBadges = await ConsultorBadge.findAll({
            where: { ID_CONSULTOR: consultorAtual.ID_CONSULTOR },
            include: [{ model: Badge }]
        });

        const MarcoConquista = require('../models/MarcoConquista');
        const todosMarcosRaw = await MarcoConquista.findAll({ attributes: ['ID_MARCO', 'PONTOS_EXTRA'] });

        const MarcoConsultor = require('../models/MarcoConsultor');

        const obterArea = (categoriaBadge) => {
            if (!categoriaBadge) return 'Geral';
            try {
                const categoria = JSON.parse(categoriaBadge);
                return categoria.area || categoria.serviceLine || 'Geral';
            } catch (e) {
                return categoriaBadge;
            }
        };

        const catalogoBadges = await Badge.findAll({
            attributes: ['ID_BADGE', 'CATEGORIA_BADGE']
        });
        const totalPorArea = {};
        const obtidosPorArea = {};

        catalogoBadges.forEach(badge => {
            const area = obterArea(badge.CATEGORIA_BADGE);
            totalPorArea[area] = (totalPorArea[area] || 0) + 1;
        });
        meusBadges.forEach(cb => {
            const area = obterArea(cb.Badge?.CATEGORIA_BADGE);
            if (!obtidosPorArea[area]) obtidosPorArea[area] = new Set();
            obtidosPorArea[area].add(cb.ID_BADGE);
        });

        const uniqueRadarLabels = Object.keys(totalPorArea).sort((a, b) => a.localeCompare(b, 'pt'));
        const radarDataValues = uniqueRadarLabels.map(area =>
            Math.min(100, Math.round(((obtidosPorArea[area]?.size || 0) / totalPorArea[area]) * 100))
        );

        if (uniqueRadarLabels.length === 0) {
            uniqueRadarLabels.push('Sem áreas no catálogo');
            radarDataValues.push(0);
        }

        const mesesLabels = [];
        const linhaPontos = [];
        const barrasEu = [];
        const barrasEquipa = [];

        for (let i = 5; i >= 0; i--) {
            const dataBase = new Date();
            dataBase.setMonth(dataBase.getMonth() - i);
            const nomeMes = dataBase.toLocaleString('pt-PT', { month: 'short' });
            mesesLabels.push(nomeMes.charAt(0).toUpperCase() + nomeMes.slice(1));

            const mesStart = new Date(dataBase.getFullYear(), dataBase.getMonth(), 1);
            const mesEnd = new Date(dataBase.getFullYear(), dataBase.getMonth() + 1, 0);

            let meusPontosMes = 0;
            const meusBadgesMes = await ConsultorBadge.findAll({
                where: { ID_CONSULTOR: consultorAtual.ID_CONSULTOR, DATA_ATRIBUICAO_BADGE: { [Op.between]: [mesStart, mesEnd] } },
                include: [{ model: Badge }]
            });
            meusPontosMes += meusBadgesMes.reduce((acc, cb) => acc + (cb.Badge?.PONTOS_BADGE || 0), 0);

            const meusMarcosMes = await MarcoConsultor.findAll({
                where: { ID_CONSULTOR: consultorAtual.ID_CONSULTOR, DATA_CONQUISTA: { [Op.between]: [mesStart, mesEnd] } }
            });
            meusMarcosMes.forEach(mc => {
                const marco = todosMarcosRaw.find(m => m.ID_MARCO == mc.ID_MARCO);
                if (marco) meusPontosMes += marco.PONTOS_EXTRA;
            });
            
            linhaPontos.push(meusPontosMes);
            barrasEu.push(meusPontosMes);

            let todosPontosMes = 0;
            const todosCbMes = await ConsultorBadge.findAll({
                where: { DATA_ATRIBUICAO_BADGE: { [Op.between]: [mesStart, mesEnd] } },
                include: [{ model: Badge }]
            });
            todosPontosMes += todosCbMes.reduce((acc, cb) => acc + (cb.Badge?.PONTOS_BADGE || 0), 0);

            const todosMarcosMes = await MarcoConsultor.findAll({
                where: { DATA_CONQUISTA: { [Op.between]: [mesStart, mesEnd] } }
            });
            todosMarcosMes.forEach(mc => {
                const marco = todosMarcosRaw.find(m => m.ID_MARCO == mc.ID_MARCO);
                if (marco) todosPontosMes += marco.PONTOS_EXTRA;
            });

            const totalConsultores = await Consultor.count();
            const mediaEquipa = totalConsultores > 0 ? Math.round(todosPontosMes / totalConsultores) : 0;
            barrasEquipa.push(mediaEquipa);
        }

        const Nivel = require('../models/Nivel');
        const todosNiveisDB = await Nivel.findAll();
        const mapaNiveisDB = {};
        todosNiveisDB.forEach(n => {
            const letra = String.fromCharCode(64 + n.ORDEM_HIERARQUICA);
            mapaNiveisDB[n.ID_NIVEL] = `${n.NOME_NIVEL} (Nível ${letra})`;
        });

        const countNiveis = {};
        meusBadges.forEach(cb => {
            const nivelId = cb.Badge?.ID_NIVEL;
            const nomeNivel = mapaNiveisDB[nivelId] || 'Nível A';
            if(!countNiveis[nomeNivel]) countNiveis[nomeNivel] = 0;
            countNiveis[nomeNivel]++;
        });

        const doughnutLabels = [];
        const doughnutDataValues = [];
        Object.entries(countNiveis).forEach(([nivel, count]) => {
            if(count > 0) {
                doughnutLabels.push(nivel);
                doughnutDataValues.push(count);
            }
        });

        if(doughnutLabels.length === 0) {
            doughnutLabels.push('Sem Badges');
            doughnutDataValues.push(1);
        }

        res.json({
            success: true,
            data: {
                radar: { labels: uniqueRadarLabels, data: radarDataValues },
                linha: { labels: mesesLabels, data: linhaPontos },
                barras: { labels: mesesLabels, eu: barrasEu, equipa: barrasEquipa },
                doughnut: { labels: doughnutLabels, data: doughnutDataValues }
            }
        });

    } catch (error) {
        console.error("ERRO DETALHADAS:", error);
        res.status(500).json({ success: false, message: 'Ocorreu um erro inesperado. Tente novamente mais tarde.' });
    }
};

// =========================================================================
// MÉTODOS DO TALENT MANAGER
// =========================================================================

controllers.getGamificacaoTM = async (req, res) => {
    try {
        const { getAllConsultorsStats } = require('../utils/pontosHelper');
        const statsCompleto = await getAllConsultorsStats();

        const totalConsultores = statsCompleto.length;
        const totalSeguro = totalConsultores > 0 ? totalConsultores : 1;
        const totalPontos = statsCompleto.reduce((acc, c) => acc + c.pontosCalculados, 0);
        const consultoresComBadge = statsCompleto.filter(c => c.badgesCalculados > 0).length;
        const percComBadge = Math.round((consultoresComBadge / totalSeguro) * 100);

        const todosCb = await ConsultorBadge.findAll({ include: [{ model: Badge }] });
        const MarcoConsultor = require('../models/MarcoConsultor');
        const MarcoConquista = require('../models/MarcoConquista');
        const todosMc = await MarcoConsultor.findAll();
        const todosMarcosRaw = await MarcoConquista.findAll();
        
        const badgesPremium = todosMc.length;
        const consultorStatsPorId = new Map(
            statsCompleto.map(s => [s.consultor.ID_CONSULTOR, s])
        );
        const marcosPorId = new Map(
            todosMarcosRaw.map(m => [m.ID_MARCO, m])
        );

        const slCountsGeral = {};
        const slConsultorMap = {};
        
        todosCb.forEach(cb => {
            let sl = cb.Badge?.CATEGORIA_BADGE || 'Sem SL';
            try { if (sl.startsWith('{')) { const obj = JSON.parse(sl); sl = obj.serviceLine || 'Sem SL'; } } catch(e){}
            
            slCountsGeral[sl] = (slCountsGeral[sl] || 0) + 1;
            
            if(!slConsultorMap[cb.ID_CONSULTOR]) slConsultorMap[cb.ID_CONSULTOR] = {};
            slConsultorMap[cb.ID_CONSULTOR][sl] = (slConsultorMap[cb.ID_CONSULTOR][sl] || 0) + 1;
        });

        const obterServiceLinePremium = idConsultor => {
            const statsConsultor = consultorStatsPorId.get(idConsultor);
            const serviceLineRegisto = statsConsultor?.consultor?.Utilizador?.SL_REGISTO;
            if (serviceLineRegisto) return serviceLineRegisto;

            const distribuicao = slConsultorMap[idConsultor] || {};
            return Object.keys(distribuicao).sort((a, b) => distribuicao[b] - distribuicao[a])[0] || 'Sem SL';
        };

        todosMc.forEach(mc => {
            const sl = obterServiceLinePremium(mc.ID_CONSULTOR);
            slCountsGeral[sl] = (slCountsGeral[sl] || 0) + 1;
            if (!slConsultorMap[mc.ID_CONSULTOR]) slConsultorMap[mc.ID_CONSULTOR] = {};
            slConsultorMap[mc.ID_CONSULTOR][sl] = (slConsultorMap[mc.ID_CONSULTOR][sl] || 0) + 1;
        });

        const rankingCompleto = statsCompleto.map(s => {
            const consSlMap = slConsultorMap[s.consultor.ID_CONSULTOR] || {};
            const favSl = s.consultor.Utilizador?.SL_REGISTO || (Object.keys(consSlMap).length > 0 
                ? Object.keys(consSlMap).sort((a,b) => consSlMap[b] - consSlMap[a])[0] 
                : 'N/A');

            return {
                id: s.consultor.ID_CONSULTOR,
                nome: s.consultor.Utilizador?.NOME_COMPLETO_UTILIZADOR || 'Desconhecido',
                sl: favSl,
                badges: s.badgesCalculados,
                pontos: s.pontosCalculados
            };
        });

        // 3. GRÁFICO DE BARRAS DINÂMICO
        const slsExistem = Object.keys(slCountsGeral);
        const mesesLabels = [];
        const slChartData = {};
        slsExistem.forEach(sl => slChartData[sl] = []);

        for (let i = 3; i >= 0; i--) {
            const dataBase = new Date();
            dataBase.setMonth(dataBase.getMonth() - i);
            const nomeMes = dataBase.toLocaleString('pt-PT', { month: 'short' });
            mesesLabels.push(nomeMes.charAt(0).toUpperCase() + nomeMes.slice(1));
            
            const mesStart = new Date(dataBase.getFullYear(), dataBase.getMonth(), 1);
            const mesEnd = new Date(dataBase.getFullYear(), dataBase.getMonth() + 1, 0);

            const tempMesCounts = {};
            slsExistem.forEach(sl => tempMesCounts[sl] = 0);

            todosCb.forEach(cb => {
                const dataCb = new Date(cb.DATA_ATRIBUICAO_BADGE);
                if (dataCb >= mesStart && dataCb <= mesEnd) {
                    let sl = cb.Badge?.CATEGORIA_BADGE || 'Sem SL';
                    try { if (sl.startsWith('{')) { const obj = JSON.parse(sl); sl = obj.serviceLine || 'Sem SL'; } } catch(e){}
                    tempMesCounts[sl] += (cb.Badge?.PONTOS_BADGE || 0);
                }
            });

            todosMc.forEach(mc => {
                const dataConquista = mc.DATA_CONQUISTA ? new Date(mc.DATA_CONQUISTA) : null;
                if (dataConquista && dataConquista >= mesStart && dataConquista <= mesEnd) {
                    const sl = obterServiceLinePremium(mc.ID_CONSULTOR);
                    const marco = marcosPorId.get(mc.ID_MARCO);
                    if (tempMesCounts[sl] !== undefined && marco) {
                        tempMesCounts[sl] += marco.PONTOS_EXTRA || 0;
                    }
                }
            });

            Object.keys(slChartData).forEach(sl => {
                slChartData[sl].push(tempMesCounts[sl]);
            });
        }

        const barDatasets = Object.keys(slChartData).map(sl => ({
            label: sl,
            data: slChartData[sl]
        })).filter(ds => ds.data.some(v => v > 0));

        res.json({
            success: true,
            data: {
                kpis: {
                    totalPontos,
                    badgesPremium,
                    percComBadge,
                    totalConsultores: totalSeguro,
                    consultoresComBadge: consultoresComBadge
                },
                graficoPizza: {
                    labels: Object.keys(slCountsGeral).length > 0 ? Object.keys(slCountsGeral) : ['Sem Badges'],
                    data: Object.values(slCountsGeral).length > 0 ? Object.values(slCountsGeral) : [1]
                },
                graficoBarras: {
                    labels: mesesLabels,
                    datasets: barDatasets
                },
                top5: rankingCompleto.slice(0, 5),
                rankingCompleto: rankingCompleto
            }
        });
    } catch (error) {
        console.error("Erro Gamificacao TM:", error);
        res.status(500).json({ success: false, message: 'Ocorreu um erro inesperado. Tente novamente mais tarde.' });
    }
};

// =========================================================================
// MÉTODOS DO SERVICE LINE LEADER (SLL)
// =========================================================================

controllers.getGamificacaoSLL = async (req, res) => {
    try {
        const sl = await obterServiceLineSLL(req.userId, req.query.sl);
        if (!sl) return res.status(400).json({ success: false, message: "SL não identificada." });

        const { getAllConsultorsStats } = require('../utils/pontosHelper');
        const statsSL = await getAllConsultorsStats({}, { SL_REGISTO: sl });
        const idsConsultores = statsSL.map(s => s.consultor.ID_CONSULTOR);
        const idsUtilizadores = statsSL.map(s => s.consultor.ID_UTILIZADOR);
        const cbSL = idsConsultores.length ? await ConsultorBadge.findAll({
            where: { ID_CONSULTOR: { [Op.in]: idsConsultores } },
            include: [{ model: Badge }]
        }) : [];
        const MarcoConquista = require('../models/MarcoConquista');
        const marcosSL = idsConsultores.length ? await MarcoConsultor.findAll({
            where: { ID_CONSULTOR: { [Op.in]: idsConsultores } }
        }) : [];
        const detalhesMarcos = await MarcoConquista.findAll();
        const marcosPorId = new Map(detalhesMarcos.map(m => [m.ID_MARCO, m]));

        // 1. KPIs Principais
        const totalPontos = statsSL.reduce((acc, stat) => acc + stat.pontosCalculados, 0);
        const totalConsultoresSL = statsSL.length;
        const mediaPontos = totalConsultoresSL ? Math.round(totalPontos / totalConsultoresSL) : 0;
        const consultoresComBadge = statsSL.filter(stat => stat.badgesCalculados > 0).length;
        const percComBadge = totalConsultoresSL ? Math.round((consultoresComBadge / totalConsultoresSL) * 100) : 0;

        const slModel = await ServiceLine.findOne({ where: { NOME_SERVICE_LINE: sl } });
        const areasDaSL = slModel
            ? await Area.findAll({ where: { ID_SERVICE_LINE: slModel.ID_SERVICE_LINE } })
            : [];
        const nomesAreasDaSL = new Set(areasDaSL.map(a => a.NOME_AREA));

        const formatAreaLabel = (areaName, serviceLineBadge) => {
            if (!areaName || areaName === 'Sem Área') return areaName || 'Sem Área';
            return serviceLineBadge && serviceLineBadge !== sl && !nomesAreasDaSL.has(areaName)
                ? `${areaName} (Service Line externa)`
                : areaName;
        };

        // 2. Doughnut (Áreas da SL e áreas externas obtidas por consultores da SL)
        const areasCount = {};
        cbSL.forEach(cb => {
            let areaName = cb.Badge?.NOME_BADGE || 'Sem Área';
            let serviceLineBadge = sl;
            try {
                if (cb.Badge?.CATEGORIA_BADGE?.startsWith('{')) {
                    const catObj = JSON.parse(cb.Badge.CATEGORIA_BADGE);
                    if (catObj.area) areaName = catObj.area;
                    if (catObj.serviceLine) serviceLineBadge = catObj.serviceLine;
                }
            } catch(e) {}
            areaName = formatAreaLabel(areaName, serviceLineBadge);
            areasCount[areaName] = (areasCount[areaName] || 0) + 1;
        });

        // 3. Gráfico de Barras (Evolução 4 Meses)
        const mesesLabels = [];
        const barData = [];
        for (let i = 3; i >= 0; i--) {
            const dataBase = new Date();
            dataBase.setMonth(dataBase.getMonth() - i);
            const nomeMes = dataBase.toLocaleString('pt-PT', { month: 'short' });
            mesesLabels.push(nomeMes.charAt(0).toUpperCase() + nomeMes.slice(1));
            
            const mesStart = new Date(dataBase.getFullYear(), dataBase.getMonth(), 1);
            const mesEnd = new Date(dataBase.getFullYear(), dataBase.getMonth() + 1, 0);

            const pontosMes = cbSL
                .filter(cb => new Date(cb.DATA_ATRIBUICAO_BADGE) >= mesStart && new Date(cb.DATA_ATRIBUICAO_BADGE) <= mesEnd)
                .reduce((acc, cb) => acc + (cb.Badge?.PONTOS_BADGE || 0), 0);
            const pontosPremiumMes = marcosSL
                .filter(mc => mc.DATA_CONQUISTA && new Date(mc.DATA_CONQUISTA) >= mesStart && new Date(mc.DATA_CONQUISTA) <= mesEnd)
                .reduce((acc, mc) => acc + (marcosPorId.get(mc.ID_MARCO)?.PONTOS_EXTRA || 0), 0);
            barData.push(pontosMes + pontosPremiumMes);
        }

        // 4. Dropdown de Consultores para Modal de Objetivos
        const consultoresLista = statsSL.map(stat => ({
            idConsultor: stat.consultor.ID_CONSULTOR,
            idUtilizador: stat.consultor.ID_UTILIZADOR,
            nome: stat.consultor.Utilizador?.NOME_COMPLETO_UTILIZADOR || 'Consultor Anónimo'
        }));

        // 5. Objetivos Ativos Recentes (Safeguard de TryCatch)
        let objFormatados = [];
        try {
            const ObjetivoTimeline = require('../models/ObjetivoTimeline');
            const objetivosAtivos = idsUtilizadores.length ? await ObjetivoTimeline.findAll({
                where: {
                    ID_UTILIZADOR: { [Op.in]: idsUtilizadores },
                    ORIGEM: 'Service Line Leader',
                    STATUS: 'Em Progresso'
                },
                order: [['DATA_OBJETIVO', 'ASC']]
            }) : [];
            for (let o of objetivosAtivos) {
                const u = await Utilizador.findByPk(o.ID_UTILIZADOR);
                objFormatados.push({
                    titulo: o.TITULO,
                    consultor: u ? u.NOME_COMPLETO_UTILIZADOR : 'Consultor (N/A)',
                    dataMeta: new Date(o.DATA_OBJETIVO).toLocaleDateString('pt-PT'),
                    descricao: o.DESCRICAO
                });
            }
        } catch (err) {
            objFormatados = [];
        }

        // 6. Badges Premium (Catálogo completo de MarcoConquista)
        const marcosPremium = await MarcoConquista.findAll({
            order: [['TITULO_MARCO', 'ASC']]
        });

        res.json({
            success: true,
            data: {
                kpis: { totalPontos, mediaPontos, percComBadge },
                doughnut: {
                    labels: Object.keys(areasCount).filter(k => areasCount[k] > 0).length > 0 ? Object.keys(areasCount).filter(k => areasCount[k] > 0) : ['N/A'],
                    data: Object.values(areasCount).filter(v => v > 0).length > 0 ? Object.values(areasCount).filter(v => v > 0) : [1]
                },
                bar: { labels: mesesLabels, data: barData },
                consultores: consultoresLista,
                objetivos: objFormatados,
                premiumBadges: marcosPremium.map(m => ({
                    id: m.ID_MARCO,
                    nome: m.TITULO_MARCO,
                    tipo: m.TIPO_MARCO || m.TIPO_CONQUISTA || m.TIPO_REGRA || 'Conquista Especial',
                    pontos: m.PONTOS_EXTRA || 0,
                    img: m.URL_IMAGEM_MARCO
                }))
            }
        });

    } catch (error) {
        console.error("ERRO GAMIFICACAO SLL:", error);
        res.status(500).json({ success: false, message: 'Ocorreu um erro inesperado. Tente novamente mais tarde.' });
    }
};

// =========================================================================
// MÉTODOS DO ADMINISTADOR
// =========================================================================

controllers.getMetricasGlobaisAdmin = async (req, res) => {
    try {
        const Pedido = require('../models/Pedido');
        const EstatisticasAcesso = require('../models/EstatisticasAcesso');
        const Badge = require('../models/Badge');
        const Area = require('../models/Area');
        const ServiceLine = require('../models/ServiceLine');
        const Consultor = require('../models/Consultor');
        const { Op } = require('sequelize');

        // 1. KPIs Topo
        const totalUtilizadores = await Utilizador.count({ where: { ESTADO_CONTA_UTILIZADOR: 'Ativo' } });
        const pedidosAceites = await Pedido.count({ where: { ESTADO_PEDIDO: 'Aceite' } });
        const pedidosRecusados = await Pedido.count({ where: { ESTADO_PEDIDO: 'Recusado' } });
        const totalDecididos = pedidosAceites + pedidosRecusados;
        const taxaAprovacao = totalDecididos > 0 ? Math.round((pedidosAceites / totalDecididos) * 100) : 0;

        const agora = new Date();
        const dataMesPassado = new Date(agora.getFullYear(), agora.getMonth(), 1);
        const dataDoisMesesAtras = new Date(agora.getFullYear(), agora.getMonth() - 1, 1);

        const usersMesPassado = await Utilizador.count({ where: { ESTADO_CONTA_UTILIZADOR: 'Ativo', DATA_REGISTO_UTILIZADOR: { [Op.between]: [dataDoisMesesAtras, dataMesPassado] } } });
        const usersEsteMes = await Utilizador.count({ where: { ESTADO_CONTA_UTILIZADOR: 'Ativo', DATA_REGISTO_UTILIZADOR: { [Op.gte]: dataMesPassado } } });
        let trendUsers = usersMesPassado > 0 ? ((usersEsteMes - usersMesPassado) / usersMesPassado * 100).toFixed(1) : (usersEsteMes > 0 ? 100 : 0);

        const [aceitesEsteMes, recusadosEsteMes, aceitesMesPassado, recusadosMesPassado] = await Promise.all([
            Pedido.count({ where: { ESTADO_PEDIDO: 'Aceite', DATA_ULTIMA_ATUALIZACAO: { [Op.gte]: dataMesPassado } } }),
            Pedido.count({ where: { ESTADO_PEDIDO: 'Recusado', DATA_ULTIMA_ATUALIZACAO: { [Op.gte]: dataMesPassado } } }),
            Pedido.count({ where: { ESTADO_PEDIDO: 'Aceite', DATA_ULTIMA_ATUALIZACAO: { [Op.between]: [dataDoisMesesAtras, dataMesPassado] } } }),
            Pedido.count({ where: { ESTADO_PEDIDO: 'Recusado', DATA_ULTIMA_ATUALIZACAO: { [Op.between]: [dataDoisMesesAtras, dataMesPassado] } } })
        ]);
        const decisoesEsteMes = aceitesEsteMes + recusadosEsteMes;
        const decisoesMesPassado = aceitesMesPassado + recusadosMesPassado;
        const taxaEsteMes = decisoesEsteMes > 0 ? (aceitesEsteMes / decisoesEsteMes) * 100 : 0;
        const taxaMesPassado = decisoesMesPassado > 0 ? (aceitesMesPassado / decisoesMesPassado) * 100 : 0;
        const trendAprovacao = decisoesEsteMes > 0
            ? (taxaEsteMes - taxaMesPassado).toFixed(1)
            : '0.0';

        // Acessos calculados usando a tabela real
        let totalAcessos = 0;
        let acessosMesPassado = 0;
        let acessosEsteMes = 0;

        try {
            totalAcessos = await EstatisticasAcesso.sum('TOTAL_ACESSOS_DIA') || 0;
            acessosMesPassado = await EstatisticasAcesso.sum('TOTAL_ACESSOS_DIA', { where: { DATA_REFERENCIA: { [Op.between]: [dataDoisMesesAtras, dataMesPassado] } } }) || 0;
            acessosEsteMes = await EstatisticasAcesso.sum('TOTAL_ACESSOS_DIA', { where: { DATA_REFERENCIA: { [Op.gte]: dataMesPassado } } }) || 0;
        } catch(e) { console.warn("Tabela ESTATISTICAS_ACESSO erro:", e); }

        let trendAcessos = acessosMesPassado > 0 ? ((acessosEsteMes - acessosMesPassado) / acessosMesPassado * 100).toFixed(1) : (acessosEsteMes > 0 ? 100 : 0);

        // Taxa de Interação (Acessos este mês / (Total Utilizadores * 30 dias))
        const totalPotencial = totalUtilizadores > 0 ? totalUtilizadores * 30 : 1; 
        const taxaInteracao = Math.min(100, Math.round((acessosEsteMes / totalPotencial) * 100));

        const statsTopo = [
            { label: "Total de Acessos na Plataforma", valor: totalAcessos.toString(), trend: `${trendAcessos >= 0 ? '+' : ''} ${trendAcessos} % vs mês passado`, color: trendAcessos >= 0 ? "text-success" : "text-danger" },
            { label: "Utilizadores Ativos", valor: totalUtilizadores.toString(), trend: `${usersEsteMes} novos ativos este mês`, color: "text-primary" },
            { label: "Taxa de Interação", valor: `${taxaInteracao} %`, trend: "Engagement Mensal", color: "text-primary" },
            { label: "Taxa Aprovação Badges", valor: `${taxaAprovacao} %`, trend: "Pedidos aceites entre pedidos decididos", color: "text-primary" }
        ];

        // 2. Acessos 7 Dias Reais
        const seteDiasAtras = new Date();
        seteDiasAtras.setDate(seteDiasAtras.getDate() - 7);
        const acessosSeteDias = await EstatisticasAcesso.findAll({
            where: { DATA_REFERENCIA: { [Op.gte]: seteDiasAtras } }
        });

        const dadosAcessos7Dias = [];
        for(let i=6; i>=0; i--) {
            const d = new Date();
            d.setDate(d.getDate() - i);
            const dataString = d.toISOString().split('T')[0];

            const countDia = acessosSeteDias.filter(a => {
                const rData = new Date(a.DATA_REFERENCIA);
                return rData.toISOString().split('T')[0] === dataString;
            }).reduce((acc, curr) => acc + curr.TOTAL_ACESSOS_DIA, 0);
            
            dadosAcessos7Dias.push({ dia: d.toLocaleDateString('pt-PT', {weekday: 'short'}), acessos: countDia });
        }

        // 3. Badges por SL Reais
        const badgesDB = await Badge.findAll();
        const serviceLines = await ServiceLine.findAll();
        
        const slCounts = {};
        serviceLines.forEach(sl => { slCounts[sl.NOME_SERVICE_LINE] = 0; });

        badgesDB.forEach(b => {
            const cat = b.CATEGORIA_BADGE;
            let slName = 'Indefinida';
            if(cat) {
                try {
                    const parsed = JSON.parse(cat);
                    slName = parsed.serviceLine || parsed.sl || cat;
                } catch(e) {}
            }
            slCounts[slName] = (slCounts[slName] || 0) + 1;
        });

        const dadosBadgesSL = Object.keys(slCounts)
            .map(k => ({ sl: k.substring(0, 15), slCompleta: k, total: slCounts[k] }))
            .sort((a,b) => b.total - a.total);
        if(dadosBadgesSL.length === 0) dadosBadgesSL.push({ sl: 'Sem dados', total: 1 });

        // 4. Áreas com Maior Interesse (Pedidos + Registos)
        const areasDB = await Area.findAll({ include: [{ model: ServiceLine }] });
        const areasInteresse = [];

        for (const area of areasDB) {
            const nomeArea = area.NOME_AREA;
            const nomeSl = area.ServiceLine ? area.ServiceLine.NOME_SERVICE_LINE : 'Indefinida';

            const countRegistos = await Utilizador.count({ where: { AREA_REGISTO: nomeArea } });
            
            let countPedidos = 0;
            const pedidosArea = await Pedido.findAll({ include: [{ model: Badge }] });
            pedidosArea.forEach(p => {
                if (p.Badge && p.Badge.CATEGORIA_BADGE) {
                    try {
                        const parsed = JSON.parse(p.Badge.CATEGORIA_BADGE);
                        if (parsed.area === nomeArea) countPedidos++;
                    } catch(e) {}
                }
            });

            const totalInteracoes = countRegistos + countPedidos;
            areasInteresse.push({
                area: nomeArea,
                sl: nomeSl,
                acessos: totalInteracoes
            });
        }

        areasInteresse.sort((a, b) => b.acessos - a.acessos);
        const topAreas = areasInteresse.slice(0, 10);
        if(topAreas.length === 0) topAreas.push({ area: 'Sem dados', sl: 'N/A', acessos: 0 });

        // 5. Utilizadores Mais Ativos Reais
        const consultoresTop = await Consultor.findAll({
            include: [{ model: Utilizador }]
        });

        const ConsultorBadge = require('../models/ConsultorBadge');
        const MarcoConsultor = require('../models/MarcoConsultor');
        const MarcoConquista = require('../models/MarcoConquista');
        
        const todosCb = await ConsultorBadge.findAll({ include: [{ model: Badge }] });
        const todosMcRaw = await MarcoConsultor.findAll();
        const todosMarcosRaw = await MarcoConquista.findAll();

        const cbMap = {};
        consultoresTop.forEach(c => cbMap[c.ID_CONSULTOR] = { pontos: 0, badgesCount: 0 });
        
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

        consultoresTop.forEach(c => {
            c.PONTUACAO_TOTAL_REAL = cbMap[c.ID_CONSULTOR].pontos;
            c.TOTAL_BADGES_REAL = cbMap[c.ID_CONSULTOR].badgesCount;
        });

        consultoresTop.sort((a, b) => b.PONTUACAO_TOTAL_REAL - a.PONTUACAO_TOTAL_REAL);
        const top5Consultores = consultoresTop.slice(0, 5);

        const utilizadoresAtivos = top5Consultores.map(c => ({
            nome: c.Utilizador?.NOME_COMPLETO_UTILIZADOR || 'Anónimo',
            funcao: 'Consultor',
            sl: c.Utilizador?.SL_REGISTO || 'Indefinida',
            tempo: `${c.PONTUACAO_TOTAL_REAL} Pts / ${c.TOTAL_BADGES_REAL} Badges`
        }));
        
        if(utilizadoresAtivos.length === 0) utilizadoresAtivos.push({ nome: 'Sem utilizadores', funcao: '-', sl: '-', tempo: '-' });

        res.json({
            success: true,
            data: {
                statsTopo,
                dadosAcessos7Dias,
                dadosBadgesSL,
                utilizadoresAtivos,
                areasInteresse: topAreas,
                detalhesCalculo: {
                    aprovacao: {
                        aceites: pedidosAceites,
                        recusados: pedidosRecusados,
                        totalDecididos,
                        regra: 'Taxa = pedidos Aceites / (pedidos Aceites + pedidos Recusados). Pedidos eliminados, rascunhos, pendentes e devolvidos não entram no cálculo.'
                    },
                    interacao: {
                        acessosEsteMes,
                        utilizadoresAtivos: totalUtilizadores,
                        totalPotencial,
                        regra: 'Taxa = acessos do mês atual / (utilizadores ativos * 30 dias), limitada a 100%.'
                    },
                    utilizadoresAtivos: {
                        totalAtual: totalUtilizadores,
                        novosAtivosEsteMes: usersEsteMes,
                        novosAtivosMesAnterior: usersMesPassado,
                        regra: 'O total mostra contas atualmente ativas. O texto inferior mostra quantas contas ativas foram criadas/aprovadas neste mês.'
                    },
                    areasInteresse: {
                        regra: 'Interações = pedidos submetidos para badges da área + registos de utilizadores que escolheram essa área.'
                    },
                    utilizadoresMaisAtivos: {
                        regra: 'Ordenação por pontos conquistados, incluindo badges normais e premium. Em caso de empate, a tabela mantém a ordem devolvida pela base de dados.'
                    }
                }
            }
        });
    } catch(e) {
        console.error("ERRO METRICAS ADMIN:", e);
        res.status(500).json({ success: false, message: 'Ocorreu um erro inesperado. Tente novamente mais tarde.' });
    }
};

module.exports = controllers;
