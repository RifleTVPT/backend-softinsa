const Consultor = require('../models/Consultor');
const ConsultorBadge = require('../models/ConsultorBadge');
const Badge = require('../models/Badge');
const MarcoConsultor = require('../models/MarcoConsultor');
const MarcoConquista = require('../models/MarcoConquista');

exports.getConsultorStats = async (idConsultor) => {
    const todosConsultores = await Consultor.findAll();
    const todosCb = await ConsultorBadge.findAll({ include: [{ model: Badge }] });
    const todosMcRaw = await MarcoConsultor.findAll();
    const todosMarcosRaw = await MarcoConquista.findAll({ attributes: ['ID_MARCO', 'PONTOS_EXTRA'] });

    const cbMap = {};
    todosConsultores.forEach(c => cbMap[c.ID_CONSULTOR] = { pontos: 0, badgesCount: 0 });
    
    todosCb.forEach(cb => {
        if(cbMap[cb.ID_CONSULTOR] && cb.Badge) {
            cbMap[cb.ID_CONSULTOR].pontos += cb.Badge.PONTOS_BADGE;
            if (!cb.DATA_EXPIRACAO || new Date(cb.DATA_EXPIRACAO) > new Date()) {
                cbMap[cb.ID_CONSULTOR].badgesCount += 1;
            }
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
    const ranking = todosConsultores.findIndex(c => c.ID_CONSULTOR == idConsultor) + 1;
    const stats = cbMap[idConsultor] || { pontos: 0, badgesCount: 0 };
    
    return {
        pontosTotais: stats.pontos,
        badgesTotais: stats.badgesCount,
        ranking: ranking,
        totalConsultores: totalConsultores
    };
};

exports.getAllConsultorsStats = async (whereConsultor = {}, whereUtilizador = {}) => {
    const Utilizador = require('../models/Utilizador');
    const todosConsultores = await Consultor.findAll({ 
        where: whereConsultor,
        include: [{ model: Utilizador, where: whereUtilizador, required: Object.keys(whereUtilizador).length > 0 }] 
    });
    const todosCb = await ConsultorBadge.findAll({ include: [{ model: Badge }] });
    const todosMcRaw = await MarcoConsultor.findAll();
    const todosMarcosRaw = await MarcoConquista.findAll({ attributes: ['ID_MARCO', 'PONTOS_EXTRA'] });

    const cbMap = {};
    todosConsultores.forEach(c => cbMap[c.ID_CONSULTOR] = { pontos: 0, badgesCount: 0 });
    
    todosCb.forEach(cb => {
        if(cbMap[cb.ID_CONSULTOR] && cb.Badge) {
            cbMap[cb.ID_CONSULTOR].pontos += cb.Badge.PONTOS_BADGE;
            if (!cb.DATA_EXPIRACAO || new Date(cb.DATA_EXPIRACAO) > new Date()) {
                cbMap[cb.ID_CONSULTOR].badgesCount += 1;
            }
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
    
    const res = todosConsultores.map(c => ({
        consultor: c,
        pontosCalculados: cbMap[c.ID_CONSULTOR].pontos,
        badgesCalculados: cbMap[c.ID_CONSULTOR].badgesCount
    }));
    res.sort((a, b) => b.pontosCalculados - a.pontosCalculados || b.badgesCalculados - a.badgesCalculados);
    return res;
};
