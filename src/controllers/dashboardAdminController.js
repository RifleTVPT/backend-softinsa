const Utilizador = require('../models/Utilizador');
const Pedido = require('../models/Pedido');
const Badge = require('../models/Badge');
const Consultor = require('../models/Consultor');
const ServiceLine = require('../models/ServiceLine');
const Area = require('../models/Area');
const Nivel = require('../models/Nivel');
const EstatisticasAcesso = require('../models/EstatisticasAcesso');
const MarcoConquista = require('../models/MarcoConquista');
const { Op } = require('sequelize');

const controllers = {};

controllers.getDashboardAdminData = async (req, res) => {
    try {
        // 1. KPIs GERAIS DA PLATAFORMA
        const utilizadoresAtivos = await Utilizador.count({ where: { ESTADO_CONTA_UTILIZADOR: 'Ativo' } });
        const badgesNormais = await Badge.count();
        const badgesPremium = await MarcoConquista.count();
        const badgesCriados = badgesNormais + badgesPremium;
        const pedidosRegisto = await Utilizador.count({ where: { ESTADO_CONTA_UTILIZADOR: 'Pendente' } });
        
        const totalAceites = await Pedido.count({ where: { ESTADO_PEDIDO: 'Aceite' } });
        const totalRecusados = await Pedido.count({ where: { ESTADO_PEDIDO: 'Recusado' } });
        const totalDecididos = totalAceites + totalRecusados;
        const taxaAprovacao = totalDecididos > 0 ? Math.round((totalAceites / totalDecididos) * 100) : 0;

        const seteDiasAtrasISO = new Date();
        seteDiasAtrasISO.setDate(seteDiasAtrasISO.getDate() - 6);
        const seteDiasStr = seteDiasAtrasISO.toISOString().split('T')[0];

        const acessosUltimos7 = await EstatisticasAcesso.findAll({
            where: { DATA_REFERENCIA: { [Op.gte]: new Date(seteDiasStr) } }
        });

        const diasLabels = [];
        const acessosData = [];

        for (let i = 6; i >= 0; i--) {
            const dataBase = new Date();
            dataBase.setDate(dataBase.getDate() - i);
            const dataISO = dataBase.toISOString().split('T')[0];
            diasLabels.push(`Dia ${dataBase.getDate()}`);
            
            const soma = acessosUltimos7.filter(a => {
                const rData = new Date(a.DATA_REFERENCIA);
                return rData.toISOString().split('T')[0] === dataISO;
            }).reduce((acc, curr) => acc + curr.TOTAL_ACESSOS_DIA, 0);
            
            acessosData.push(soma);
        }

        // 3. Gráfico de Barras - Service Lines (Acessos por SL)
        const serviceLines = await ServiceLine.findAll();
        const slNomes = [];
        const barrasSLData = [];

        for (const sl of serviceLines) {
            slNomes.push(sl.NOME_SERVICE_LINE);
            const sumAcessosSL = await EstatisticasAcesso.sum('TOTAL_ACESSOS_DIA', { where: { ID_SERVICE_LINE: sl.ID_SERVICE_LINE } });
            barrasSLData.push(sumAcessosSL || 0);
        }

        const acessosGlobais = await EstatisticasAcesso.sum('TOTAL_ACESSOS_DIA', { where: { ID_SERVICE_LINE: null } });
        slNomes.push('Global (Admin + TM)');
        barrasSLData.push(acessosGlobais || 0);

        // 4. Atividade Recente
        const atividades = [];
        const ultimosPedidos = await Pedido.findAll({
            where: { ESTADO_PEDIDO: { [Op.in]: ['Pendente', 'Em Análise SLL', 'Pendente de Correção'] } },
            limit: 10, order: [['DATA_SUBMISSAO_PEDIDO', 'DESC']],
            include: [
                { model: Utilizador }, 
                { model: Badge }
            ]
        });
        
        const todosNiveis = await Nivel.findAll();
        const mapNivel = {};
        const mapNivelLetra = {};
        todosNiveis.forEach(n => {
            mapNivel[n.ID_NIVEL] = n.NOME_NIVEL;
            mapNivelLetra[n.ID_NIVEL] = String.fromCharCode(64 + n.ORDEM_HIERARQUICA);
        });
        
        for (const p of ultimosPedidos) {
            let slParsed = p.Badge?.CATEGORIA_BADGE || 'N/A';
            let areaParsed = slParsed;
            try {
                if (slParsed.startsWith('{')) {
                    const catObj = JSON.parse(slParsed);
                    if (catObj.serviceLine) slParsed = catObj.serviceLine;
                    if (catObj.area) areaParsed = catObj.area;
                }
            } catch(e) {}
            
            const nomeNivel = mapNivel[p.Badge?.ID_NIVEL] || 'Desconhecido';
            const letraNivel = mapNivelLetra[p.Badge?.ID_NIVEL] || '?';

            atividades.push({
                id: p.ID_PEDIDO, type: 'badge',
                title: `Pedido Validação Badge ${p.Badge?.NOME_BADGE}`,
                detail: `Consultor: ${p.Utilizador?.NOME_COMPLETO_UTILIZADOR}`,
                subDetail: `Service Line ${slParsed} | Área de ${areaParsed} - Nível ${nomeNivel} (${letraNivel})`,
                action: 'Ver Pedido',
                link: `/admin/badges/pedidos/detalhes/${p.ID_PEDIDO}`,
                date: p.DATA_SUBMISSAO_PEDIDO,
                badgeImg: p.Badge?.URL_IMAGEM || null
            });
        }

        const ultimosRegistos = await Utilizador.findAll({
            where: { ESTADO_CONTA_UTILIZADOR: 'Pendente' },
            limit: 10, order: [['DATA_REGISTO_UTILIZADOR', 'DESC']]
        });
        
        for (const u of ultimosRegistos) {
            const isSLL = await require('../models/ServiceLineLeader').findOne({ where: { ID_UTILIZADOR: u.ID_UTILIZADOR }});
            const isTM = await require('../models/TalentManager').findOne({ where: { ID_UTILIZADOR: u.ID_UTILIZADOR }});
            
            let perfilStr = 'Consultor';
            if (isSLL) perfilStr = 'Service Line Leader';
            if (isTM) perfilStr = 'Talent Manager';

            const slRegParsed = u.SL_REGISTO || 'Indefinida';
            const areaRegParsed = u.AREA_REGISTO || 'Indefinida';

            atividades.push({
                id: u.ID_UTILIZADOR, type: 'registo',
                title: `Pedido de Registo (${perfilStr})`,
                detail: `Candidato: ${u.NOME_COMPLETO_UTILIZADOR}`,
                subDetail: `Service Line ${slRegParsed} | Área de ${areaRegParsed}`,
                action: 'Validar Contas',
                link: '/admin/utilizadores/pedidos',
                date: u.DATA_REGISTO_UTILIZADOR,
                userName: u.NOME_COMPLETO_UTILIZADOR,
                userImg: u.FOTO_PERFIL_UTILIZADOR || 'https://ui-avatars.com/api/?name=' + encodeURIComponent(u.NOME_COMPLETO_UTILIZADOR)
            });
        }
        
        // Ordena tudo pela data mais recente e corta para apenas os últimos 4
        atividades.sort((a, b) => new Date(b.date) - new Date(a.date));
        const atividadesTop4 = atividades.slice(0, 4);

        // 5. Percentagens dinâmicas
        const agora = new Date();
        const inicioMesAtual = new Date(agora.getFullYear(), agora.getMonth(), 1);
        const inicioMesAnterior = new Date(agora.getFullYear(), agora.getMonth() - 1, 1);

        const usersMesAtual = await Utilizador.count({ where: { ESTADO_CONTA_UTILIZADOR: 'Ativo', DATA_REGISTO_UTILIZADOR: { [Op.gte]: inicioMesAtual } } });
        const usersMesAnterior = await Utilizador.count({ where: { ESTADO_CONTA_UTILIZADOR: 'Ativo', DATA_REGISTO_UTILIZADOR: { [Op.between]: [inicioMesAnterior, inicioMesAtual] } } });
        let txCrescimentoAtivos = usersMesAnterior > 0
            ? ((usersMesAtual - usersMesAnterior) / usersMesAnterior) * 100
            : (usersMesAtual > 0 ? 100 : 0);

        const [aceitesMesAtual, recusadosMesAtual, aceitesMesAnterior, recusadosMesAnterior] = await Promise.all([
            Pedido.count({ where: { ESTADO_PEDIDO: 'Aceite', DATA_ULTIMA_ATUALIZACAO: { [Op.gte]: inicioMesAtual } } }),
            Pedido.count({ where: { ESTADO_PEDIDO: 'Recusado', DATA_ULTIMA_ATUALIZACAO: { [Op.gte]: inicioMesAtual } } }),
            Pedido.count({ where: { ESTADO_PEDIDO: 'Aceite', DATA_ULTIMA_ATUALIZACAO: { [Op.between]: [inicioMesAnterior, inicioMesAtual] } } }),
            Pedido.count({ where: { ESTADO_PEDIDO: 'Recusado', DATA_ULTIMA_ATUALIZACAO: { [Op.between]: [inicioMesAnterior, inicioMesAtual] } } })
        ]);
        const decisoesMesAtual = aceitesMesAtual + recusadosMesAtual;
        const decisoesMesAnterior = aceitesMesAnterior + recusadosMesAnterior;
        const taxaMesAtual = decisoesMesAtual > 0 ? (aceitesMesAtual / decisoesMesAtual) * 100 : 0;
        const taxaMesAnterior = decisoesMesAnterior > 0 ? (aceitesMesAnterior / decisoesMesAnterior) * 100 : 0;
        const txCrescimentoAprovacao = decisoesMesAtual > 0
            ? taxaMesAtual - taxaMesAnterior
            : 0;

        res.json({
            success: true,
            data: {
                kpis: { 
                    utilizadoresAtivos, 
                    badgesCriados, 
                    pedidosRegisto, 
                    taxaAprovacao,
                    taxaCrescimentoUsers: txCrescimentoAtivos.toFixed(1),
                    taxaCrescimentoAprovacao: txCrescimentoAprovacao.toFixed(1)
                },
                graficoLinha: { labels: diasLabels, data: acessosData },
                graficoBarras: { labels: slNomes, data: barrasSLData },
                atividades: atividadesTop4
            }
        });
    } catch (error) {
        console.error("ERRO DASHBOARD ADMIN:", error);
        res.status(500).json({ success: false, message: 'Ocorreu um erro inesperado. Tente novamente mais tarde.' });
    }
};

module.exports = controllers;
