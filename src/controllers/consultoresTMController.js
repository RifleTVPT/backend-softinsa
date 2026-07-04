const Consultor = require('../models/Consultor');
const Utilizador = require('../models/Utilizador');
const ConsultorBadge = require('../models/ConsultorBadge');
const Badge = require('../models/Badge');
const MarcoConsultor = require('../models/MarcoConsultor');
const MarcoConquista = require('../models/MarcoConquista');
const Pedido = require('../models/Pedido');
const Evidencia = require('../models/Evidencia');
const Requisito = require('../models/Requisito');
const Nivel = require('../models/Nivel');
const { Op } = require('sequelize');

const controllers = {};

controllers.getListaConsultores = async (req, res) => {
    try {
        const consultores = await Consultor.findAll({
            include: [{ model: Utilizador }]
        });

        const consultorBadges = await ConsultorBadge.findAll({
            include: [{ model: Badge }]
        });

        let marcosGanhos = [];
        let todosMarcos = [];
        try {
            marcosGanhos = await MarcoConsultor.findAll();
            todosMarcos = await MarcoConquista.findAll();
        } catch(e) {}

        const lista = consultores.map(c => {
            const myBadges = consultorBadges.filter(cb => cb.ID_CONSULTOR === c.ID_CONSULTOR);

            const slCounts = {};
            const areaCounts = {};
            
            myBadges.forEach(cb => {
                let sl = cb.Badge?.CATEGORIA_BADGE || 'Sem Service Line';
                let area = cb.Badge?.NOME_BADGE || 'Sem Área';
                try {
                    if (sl.startsWith('{')) {
                        const catObj = JSON.parse(sl);
                        if (catObj.serviceLine) sl = catObj.serviceLine;
                        if (catObj.area) area = catObj.area;
                    }
                } catch(e) {}
                
                slCounts[sl] = (slCounts[sl] || 0) + 1;
                areaCounts[area] = (areaCounts[area] || 0) + 1;
            });
            
            const slAtribuida = c.Utilizador?.SL_REGISTO;
            const areaAtribuida = c.Utilizador?.AREA_REGISTO;
            const favSl = slAtribuida || Object.keys(slCounts).sort((a,b) => slCounts[b] - slCounts[a])[0] || 'N/A';
            const favArea = areaAtribuida || Object.keys(areaCounts).sort((a,b) => areaCounts[b] - areaCounts[a])[0] || 'N/A';

            const myMarcos = marcosGanhos.filter(m => m.ID_CONSULTOR === c.ID_CONSULTOR);
            
            let pontosReais = 0;
            myBadges.forEach(cb => pontosReais += (cb.Badge?.PONTOS_BADGE || 0));
            myMarcos.forEach(mc => {
                const mk = todosMarcos.find(t => t.ID_MARCO === mc.ID_MARCO);
                if (mk) pontosReais += (mk.PONTOS_EXTRA || 0);
            });

            return {
                id: c.ID_CONSULTOR,
                idUtilizador: c.ID_UTILIZADOR,
                nome: c.Utilizador?.NOME_COMPLETO_UTILIZADOR || `Consultor ${c.ID_CONSULTOR}`,
                foto: c.Utilizador?.URL_FOTO || null,
                sl: favSl,
                area: favArea,
                badges: myBadges.length + myMarcos.length,
                pontos: pontosReais > 0 ? pontosReais : (c.PONTUACAO_TOTAL || 0)
            };
        });

        res.json({ success: true, data: lista });
    } catch (error) {
        console.error("ERRO GET LISTA CONSULTORES:", error);
        res.status(500).json({ success: false, message: error.message });
    }
};

controllers.getPerfilConsultor = async (req, res) => {
    try {
        const { id } = req.params;
        
        // 1. Procurar Consultor e as suas definições
        const c = await Consultor.findByPk(id, {
            include: [{ model: Utilizador }]
        });

        if(!c) return res.status(404).json({ success: false, message: 'Consultor não encontrado' });

        // 2. Procura os Badges do Consultor
        const myBadges = await ConsultorBadge.findAll({
            where: { ID_CONSULTOR: id },
            include: [{ model: Badge }]
        });

        // 3. Procura os Marcos do Consultor (Com segurança e sem falhas de associação)
        let myMarcosGanhos = [];
        let detalheMarcos = [];
        try {
            myMarcosGanhos = await MarcoConsultor.findAll({
                where: { ID_CONSULTOR: id }
            });
            const idsGanhos = myMarcosGanhos.map(m => m.ID_MARCO);
            if (idsGanhos.length > 0) {
                detalheMarcos = await MarcoConquista.findAll({
                    where: { ID_MARCO: { [Op.in]: idsGanhos } }
                });
            }
        } catch(e) { console.log("Marcos não carregados:", e); }

        const totalConsultores = await Consultor.count();
        const rankPos = await Consultor.count({ where: { PONTUACAO_TOTAL: { [Op.gt]: c.PONTUACAO_TOTAL || 0 } } }) + 1;

        const slCounts = {};
        const areaCounts = {};
        myBadges.forEach(cb => {
            let sl = cb.Badge?.CATEGORIA_BADGE || 'Sem Service Line';
            let area = cb.Badge?.CATEGORIA_BADGE || 'Sem Área';
            try {
                if (sl.startsWith('{')) {
                    const catObj = JSON.parse(sl);
                    if (catObj.serviceLine) sl = catObj.serviceLine;
                    if (catObj.area) area = catObj.area;
                }
            } catch(e) {}
            slCounts[sl] = (slCounts[sl] || 0) + 1;
            areaCounts[area] = (areaCounts[area] || 0) + 1;
        });
        const favSl = c.Utilizador?.SL_REGISTO || Object.keys(slCounts).sort((a,b) => slCounts[b] - slCounts[a])[0] || 'N/A';
        const favArea = c.Utilizador?.AREA_REGISTO || Object.keys(areaCounts).sort((a,b) => areaCounts[b] - areaCounts[a])[0] || 'N/A';

        const niveis = await Nivel.findAll();
        const niveisPorId = new Map(niveis.map(n => [n.ID_NIVEL, n]));
        const badgesList = myBadges.map(cb => {
             const nivel = niveisPorId.get(cb.Badge?.ID_NIVEL);
             const nivelLetra = nivel?.ORDEM_HIERARQUICA
                 ? String.fromCharCode(64 + nivel.ORDEM_HIERARQUICA)
                 : 'N/A';
             const nivelStr = nivel ? `${nivel.NOME_NIVEL} (${nivelLetra})` : 'N/A';
             let areaParsed = cb.Badge?.CATEGORIA_BADGE || 'Área';
             try {
                if (areaParsed.startsWith('{')) {
                    const catObj = JSON.parse(areaParsed);
                    if (catObj.area) areaParsed = catObj.area;
                }
             } catch(e) {}
             return {
                 id: cb.ID_BADGE,
                 area: areaParsed,
                 sub: `${cb.Badge?.NOME_BADGE || 'Badge'} - Nível ${nivelStr}`,
                 data: cb.DATA_ATRIBUICAO_BADGE ? new Date(cb.DATA_ATRIBUICAO_BADGE).toLocaleDateString('pt-PT') : 'N/A',
                 bonus: cb.Badge?.PONTOS_BADGE || 0,
                 especial: false
             }
        });

        myMarcosGanhos.forEach(mc => {
            const detalhe = detalheMarcos.find(d => d.ID_MARCO === mc.ID_MARCO);
            if (detalhe) {
                badgesList.push({
                    id: `M${mc.ID_MARCO}`,
                    area: detalhe.TITULO_MARCO || 'Conquista Especial',
                    descricao: detalhe.DESCRICAO_MARCO || 'Reconhecimento',
                    bonus: detalhe.PONTOS_EXTRA || 0,
                    data: new Date(mc.DATA_CONQUISTA).toLocaleDateString('pt-PT'),
                    especial: true
                });
            }
        });
        
        // NOVA LÓGICA: Verifica se tem um Avatar para apresentar ou devolve null para o frontend decidir
        const avatarToUse = c.Utilizador?.URL_FOTO ? c.Utilizador.URL_FOTO : null;

        // 4. JORNADA DE CARREIRA (Candidaturas em progresso)
        const pedidosPendentes = await Pedido.findAll({
            where: { 
                ID_UTILIZADOR: c.ID_UTILIZADOR, 
                ESTADO_PEDIDO: { [Op.in]: ['Pendente', 'Em Análise TM', 'Em Análise SLL', 'Pendente de Correção', 'Rascunho'] } 
            },
            include: [{ model: Badge }]
        });

        const aprendizagens = [];
        for (let p of pedidosPendentes) {
            const totalReq = await Requisito.count({ where: { ID_BADGE: p.ID_BADGE } });
            const evidencias = await Evidencia.findAll({ where: { ID_PEDIDO: p.ID_PEDIDO } });
            const reqComFicheiros = new Set(evidencias.filter(e => e.ID_REQUISITO !== null).map(e => e.ID_REQUISITO)).size;
            
            if (evidencias.length === 0) continue;
            
            const perc = Math.round((reqComFicheiros / (totalReq === 0 ? 1 : totalReq)) * 100);
            
            aprendizagens.push({
                titulo: p.Badge.NOME_BADGE,
                progresso: perc > 100 ? 100 : perc
            });
        }

        const totalBadgesSL = await Badge.count({ where: { CATEGORIA_BADGE: { [Op.like]: `%${favSl}%` } } });
        const meusBadgesSL = myBadges.filter(cb => {
            let sl = cb.Badge?.CATEGORIA_BADGE || '';
            try {
                if (sl.startsWith('{')) sl = JSON.parse(sl).serviceLine;
            } catch(e) {}
            return sl === favSl;
        }).length;
        const progressoPercent = totalBadgesSL > 0 ? Math.round((meusBadgesSL / totalBadgesSL) * 100) : 0;

        let pontosReais = 0;
        let pontosEstaSemana = 0;
        
        const umaSemanaAtras = new Date();
        umaSemanaAtras.setDate(umaSemanaAtras.getDate() - 7);

        myBadges.forEach(cb => {
            const pts = (cb.Badge?.PONTOS_BADGE || 0);
            pontosReais += pts;
            if (new Date(cb.DATA_ATRIBUICAO_BADGE) >= umaSemanaAtras) {
                pontosEstaSemana += pts;
            }
        });
        myMarcosGanhos.forEach(mc => {
            const mk = detalheMarcos.find(t => t.ID_MARCO === mc.ID_MARCO);
            if (mk) {
                const pts = (mk.PONTOS_EXTRA || 0);
                pontosReais += pts;
                if (new Date(mc.DATA_CONQUISTA) >= umaSemanaAtras) {
                    pontosEstaSemana += pts;
                }
            }
        });
        const finalPontos = pontosReais > 0 ? pontosReais : (c.PONTUACAO_TOTAL || 0);

        res.json({
            success: true,
            data: {
                idUtilizador: c.ID_UTILIZADOR,
                nome: c.Utilizador?.NOME_COMPLETO_UTILIZADOR || `Consultor ${c.ID_CONSULTOR}`,
                avatarConsultor: avatarToUse,
                sl: favSl,
                area: favArea,
                pontos: finalPontos,
                pontosSemana: pontosEstaSemana,
                rank: rankPos,
                totalConsultores: totalConsultores,
                progressoSL: progressoPercent,
                aprendizagens: aprendizagens,
                badges: badgesList
            }
        });

    } catch (error) {
        console.error("ERRO GET PERFIL CONSULTOR:", error);
        res.status(500).json({ success: false, message: error.message });
    }
};

module.exports = controllers;
