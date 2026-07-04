const Consultor = require('../models/Consultor');
const Utilizador = require('../models/Utilizador');
const ConsultorBadge = require('../models/ConsultorBadge');
const Badge = require('../models/Badge');
const Nivel = require('../models/Nivel');
const MarcoConsultor = require('../models/MarcoConsultor');
const MarcoConquista = require('../models/MarcoConquista');
const { Op } = require('sequelize');
const { obterServiceLineSLL: resolverServiceLineSLL } = require('../utils/sllServiceLineHelper');

const controllers = {};

const obterServiceLineSLL = async (req) => {
    return resolverServiceLineSLL(req.userId, req.query.sl);
};

controllers.getListaConsultoresSL = async (req, res) => {
    try {
        const sl = await obterServiceLineSLL(req);
        if (!sl) return res.status(400).json({ success: false, message: "Service Line não especificada." });

        const { getAllConsultorsStats } = require('../utils/pontosHelper');
        // Filtra utilizadores pela SL_REGISTO (em vez de filtrar quem tem um badge da SL)
        const statsBase = await getAllConsultorsStats({}, { SL_REGISTO: sl });

        const idsConsultores = statsBase.map(s => s.consultor.ID_CONSULTOR);
        if (idsConsultores.length === 0) return res.json({ success: true, data: [] });

        const consultorBadges = await ConsultorBadge.findAll({
            where: { ID_CONSULTOR: { [Op.in]: idsConsultores } },
            include: [{
                model: Badge,
                where: { CATEGORIA_BADGE: { [Op.like]: `%${sl}%` } },
                include: [Nivel]
            }]
        });

        const listaFinal = statsBase.map(s => {
            const myBadgesSL = consultorBadges.filter(cb => cb.ID_CONSULTOR === s.consultor.ID_CONSULTOR);
            
            const areaCounts = {};
            let maxNivel = 0;
            
            myBadgesSL.forEach(cb => {
                let areaParsed = cb.Badge?.CATEGORIA_BADGE || 'Sem Área';
                try {
                    if (areaParsed.startsWith('{')) {
                        const catObj = JSON.parse(areaParsed);
                        if (catObj.area) areaParsed = catObj.area;
                    }
                } catch(e) {}
                
                areaCounts[areaParsed] = (areaCounts[areaParsed] || 0) + 1;
                const ordemNivel = cb.Badge?.Nivel?.ORDEM_HIERARQUICA || 0;
                if (ordemNivel > maxNivel) maxNivel = ordemNivel;
            });
            
            const favArea = s.consultor.Utilizador?.AREA_REGISTO
                || Object.keys(areaCounts).sort((a,b) => areaCounts[b] - areaCounts[a])[0]
                || 'N/A';
            
            let nivelExp = 'Iniciante';
            if (maxNivel === 1) nivelExp = 'Júnior';
            else if (maxNivel === 2) nivelExp = 'Intermédio';
            else if (maxNivel === 3) nivelExp = 'Sénior';
            else if (maxNivel === 4) nivelExp = 'Especialista';
            else if (maxNivel === 5) nivelExp = 'Líder de Conhecimento';

            return {
                id: s.consultor.ID_CONSULTOR,
                idUtilizador: s.consultor.ID_UTILIZADOR,
                nome: s.consultor.Utilizador?.NOME_COMPLETO_UTILIZADOR || `Consultor ${s.consultor.ID_CONSULTOR}`,
                foto: s.consultor.Utilizador?.URL_FOTO || null,
                sl: sl,
                area: favArea,
                experiencia: nivelExp,
                badges: s.badgesCalculados,
                pontos: s.pontosCalculados
            };
        });

        res.json({ success: true, data: listaFinal });
    } catch (error) {
        console.error("ERRO GET LISTA SLL:", error);
        res.status(500).json({ success: false, message: error.message });
    }
};

controllers.getPerfilConsultorSL = async (req, res) => {
    try {
        const { id } = req.params;
        const sl = await obterServiceLineSLL(req);
        if (!sl) return res.status(400).json({ success: false, message: 'Service Line não especificada.' });
        
        const c = await Consultor.findByPk(id, { include: [{ model: Utilizador }] });
        if(!c) return res.status(404).json({ success: false, message: 'Consultor não encontrado' });
        if (c.Utilizador?.SL_REGISTO !== sl) {
            return res.status(403).json({ success: false, message: 'Este consultor não pertence à sua Service Line.' });
        }

        const { getAllConsultorsStats } = require('../utils/pontosHelper');
        const allStatsSL = await getAllConsultorsStats({}, { SL_REGISTO: sl });
        const totalConsultores = allStatsSL.length;
        
        let rankPos = 'N/A';
        const myIdx = allStatsSL.findIndex(s => s.consultor.ID_CONSULTOR === Number(id));
        if (myIdx !== -1) rankPos = myIdx + 1;

        let myPointsTotal = 0;
        let myBadgesCount = 0;
        if (myIdx !== -1) {
            myPointsTotal = allStatsSL[myIdx].pontosCalculados;
            myBadgesCount = allStatsSL[myIdx].badgesCalculados;
        } else {
            const soloStats = await getAllConsultorsStats({ ID_CONSULTOR: id });
            if (soloStats.length > 0) {
                myPointsTotal = soloStats[0].pontosCalculados;
                myBadgesCount = soloStats[0].badgesCalculados;
            }
        }

        // Procura TODOS os badges e marcos para a lista (Mista: Normais + Premium)
        const allBadges = await ConsultorBadge.findAll({
            where: { ID_CONSULTOR: id },
            include: [{ model: Badge }]
        });
        
        let myMarcos = [];
        let detalheMarcos = [];
        try {
            myMarcos = await MarcoConsultor.findAll({
                where: { ID_CONSULTOR: id }
            });
            const idsGanhos = myMarcos.map(m => m.ID_MARCO);
            if (idsGanhos.length > 0) {
                detalheMarcos = await MarcoConquista.findAll({
                    where: { ID_MARCO: { [Op.in]: idsGanhos } }
                });
            }
        } catch(e) {}

        const niveis = await Nivel.findAll();
        const niveisPorId = new Map(niveis.map(n => [n.ID_NIVEL, n]));
        const badgesList = allBadges.map(cb => {
             const nivel = niveisPorId.get(cb.Badge?.ID_NIVEL);
             const nivelLetra = nivel?.ORDEM_HIERARQUICA
                 ? String.fromCharCode(64 + nivel.ORDEM_HIERARQUICA)
                 : 'N/A';
             const nivelStr = nivel ? `${nivel.NOME_NIVEL} (${nivelLetra})` : 'N/A';
             let areaParsed = cb.Badge?.CATEGORIA_BADGE || 'Área';
             let realSL = areaParsed;
             try {
                if (areaParsed.startsWith('{')) {
                    const catObj = JSON.parse(areaParsed);
                    if (catObj.area) areaParsed = catObj.area;
                    if (catObj.serviceLine) realSL = catObj.serviceLine;
                }
             } catch(e) {}
             return {
                 id: cb.ID_BADGE,
                 area: areaParsed,
                 sub: `${cb.Badge?.NOME_BADGE || 'Badge'} - Nível ${nivelStr}`,
                 data: cb.DATA_ATRIBUICAO_BADGE ? new Date(cb.DATA_ATRIBUICAO_BADGE).toLocaleDateString('pt-PT') : 'N/A',
                 bonus: cb.Badge?.PONTOS_BADGE || 0,
                 especial: false,
                 isOutraSL: false // Pode manter visual igual mas não distinguir aqui
             }
        });

        myMarcos.forEach(mc => {
            const detalhe = detalheMarcos.find(d => d.ID_MARCO === mc.ID_MARCO);
            if (detalhe) {
                badgesList.push({
                    id: `M${mc.ID_MARCO}`,
                    area: detalhe.TITULO_MARCO || 'Conquista Especial',
                    sub: detalhe.DESCRICAO_MARCO || 'Reconhecimento',
                    bonus: detalhe.PONTOS_EXTRA || 0,
                    data: mc.DATA_CONQUISTA ? new Date(mc.DATA_CONQUISTA).toLocaleDateString('pt-PT') : 'N/A',
                    especial: true,
                    isOutraSL: false
                });
            }
        });

        const umaSemanaAtras = new Date();
        umaSemanaAtras.setDate(umaSemanaAtras.getDate() - 7);
        const pontosSemanaBadges = allBadges
            .filter(cb => new Date(cb.DATA_ATRIBUICAO_BADGE) >= umaSemanaAtras)
            .reduce((total, cb) => total + (cb.Badge?.PONTOS_BADGE || 0), 0);
        const pontosSemanaMarcos = myMarcos.reduce((total, mc) => {
            if (!mc.DATA_CONQUISTA || new Date(mc.DATA_CONQUISTA) < umaSemanaAtras) return total;
            const marco = detalheMarcos.find(d => d.ID_MARCO === mc.ID_MARCO);
            return total + (marco?.PONTOS_EXTRA || 0);
        }, 0);
        
        // Ordenar misto por data
        badgesList.sort((a,b) => {
            const da = a.data !== 'N/A' ? new Date(a.data.split('/').reverse().join('-')) : new Date(0);
            const db = b.data !== 'N/A' ? new Date(b.data.split('/').reverse().join('-')) : new Date(0);
            return db - da;
        });

        const avatarToUse = c.Utilizador?.URL_FOTO ? c.Utilizador.URL_FOTO : null;
        
        const Pedido = require('../models/Pedido');
        const Requisito = require('../models/Requisito');
        const Evidencia = require('../models/Evidencia');
        
        // Candidaturas em curso, desde o rascunho até à decisão final.
        const pedidosPendentes = await Pedido.findAll({
            where: { 
                ID_UTILIZADOR: c.ID_UTILIZADOR, 
                ESTADO_PEDIDO: {
                    [Op.in]: ['Rascunho', 'Pendente', 'Em Análise TM', 'Em Análise SLL']
                }
            },
            include: [{ model: Badge }]
        });

        const aprendizagens = [];
        for (let p of pedidosPendentes) {
            const totalReq = await Requisito.count({ where: { ID_BADGE: p.ID_BADGE } });
            const evidencias = await Evidencia.findAll({ where: { ID_PEDIDO: p.ID_PEDIDO } });
            const reqComFicheiros = new Set(evidencias.filter(e => e.ID_REQUISITO !== null).map(e => e.ID_REQUISITO)).size;
            
            const perc = Math.round((reqComFicheiros / (totalReq === 0 ? 1 : totalReq)) * 100);
            
            aprendizagens.push({
                titulo: p.Badge?.NOME_BADGE || 'Badge',
                progresso: perc > 100 ? 100 : perc
            });
        }

        const totalBadgesBD = await Badge.count({ where: { CATEGORIA_BADGE: { [Op.like]: `%${sl}%` } } });
        const myBadgesSL = allBadges.filter(cb => cb.Badge && cb.Badge.CATEGORIA_BADGE && cb.Badge.CATEGORIA_BADGE.includes(sl));
        const progressoPercent = totalBadgesBD > 0 ? Math.round((myBadgesSL.length / totalBadgesBD) * 100) : 0;

        res.json({
            success: true,
            data: {
                idUtilizador: c.ID_UTILIZADOR,
                nome: c.Utilizador?.NOME_COMPLETO_UTILIZADOR || `Consultor ${c.ID_CONSULTOR}`,
                avatarConsultor: avatarToUse,
                sl: c.Utilizador?.SL_REGISTO || sl,
                area: c.Utilizador?.AREA_REGISTO || 'Não Definida',
                pontos: myPointsTotal,
                pontosSemana: pontosSemanaBadges + pontosSemanaMarcos,
                rankSL: rankPos,
                totalNaSL: totalConsultores,
                progressoSL: progressoPercent,
                aprendizagens: aprendizagens,
                badges: badgesList
            }
        });
    } catch (error) {
        console.error("ERRO GET PERFIL SLL:", error);
        res.status(500).json({ success: false, message: error.message });
    }
};

module.exports = controllers;
