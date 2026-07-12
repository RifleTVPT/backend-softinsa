const Pedido = require('../models/Pedido');
const Badge = require('../models/Badge');
const Consultor = require('../models/Consultor');
const ConsultorBadge = require('../models/ConsultorBadge');
const MarcoConsultor = require('../models/MarcoConsultor');
const MarcoConquista = require('../models/MarcoConquista');
const Utilizador = require('../models/Utilizador');
const Nivel = require('../models/Nivel');
const AvisoGeral = require('../models/AvisoGeral');
const Notificacao = require('../models/Notificacao');
const Area = require('../models/Area');
const ServiceLine = require('../models/ServiceLine');
const { Op } = require('sequelize');
const { obterServiceLineSLL } = require('../utils/sllServiceLineHelper');

const controllers = {};

controllers.getDashboardSLLData = async (req, res) => {
    try {
        const { sl, id } = req.query;
        const serviceLine = await obterServiceLineSLL(req.userId, sl);
        if (!serviceLine) {
            return res.status(400).json({ success: false, message: 'Service Line do SLL não identificada' });
        }
        const filtroBadgeSL = { CATEGORIA_BADGE: { [Op.like]: `%${serviceLine}%` } };

        // 1. Pedidos Pendentes para o SLL (Aceites pelo TM = 'Em Análise SLL')
        const pedidosBD = await Pedido.findAll({
            where: { ESTADO_PEDIDO: 'Em Análise SLL' },
            include: [
                { model: Utilizador },
                { model: Badge, where: filtroBadgeSL, include: [Nivel] } 
            ],
            order: [['DATA_SUBMISSAO_PEDIDO', 'ASC']]
        });

        const pedidosPendentes = pedidosBD.filter(p => {
            try { return JSON.parse(p.Badge.CATEGORIA_BADGE).serviceLine === serviceLine; }
            catch (e) { return p.Badge.CATEGORIA_BADGE === serviceLine; }
        }).map(p => {
            let area = 'Geral';
            try { area = JSON.parse(p.Badge.CATEGORIA_BADGE).area || area; } catch (e) {}
            return {
                id: p.ID_PEDIDO,
                consultor: p.Utilizador?.NOME_COMPLETO_UTILIZADOR || 'Desconhecido',
                badge: p.Badge?.NOME_BADGE || 'Badge',
                urlImagem: p.Badge?.URL_IMAGEM || '',
                area,
                nivel: p.Badge?.Nivel
                    ? `${String.fromCharCode(64 + p.Badge.Nivel.ORDEM_HIERARQUICA)} - ${p.Badge.Nivel.NOME_NIVEL}`
                    : 'Nível não definido'
            };
        });

        // 2. Gráfico Evolução Linhas (Últimos 6 meses para esta SL)
        const labelsLinha = [];
        const dadosLinha = [];
        const { getAllConsultorsStats } = require('../utils/pontosHelper');
        const statsSL = await getAllConsultorsStats({}, { SL_REGISTO: serviceLine });
        const idsConsultoresSL = statsSL.map(stat => stat.consultor.ID_CONSULTOR);
        
        const todosCbSL = idsConsultoresSL.length ? await ConsultorBadge.findAll({
            where: { ID_CONSULTOR: { [Op.in]: idsConsultoresSL } },
            include: [{ model: Badge }]
        }) : [];
        const marcosSL = idsConsultoresSL.length ? await MarcoConsultor.findAll({
            where: { ID_CONSULTOR: { [Op.in]: idsConsultoresSL } }
        }) : [];
        const detalhesMarcos = await MarcoConquista.findAll();
        const marcosPorId = new Map(detalhesMarcos.map(m => [m.ID_MARCO, m]));

        for (let i = 5; i >= 0; i--) {
            const dataBase = new Date();
            dataBase.setMonth(dataBase.getMonth() - i);
            const nomeMes = dataBase.toLocaleString('pt-PT', { month: 'short' });
            labelsLinha.push(nomeMes.charAt(0).toUpperCase() + nomeMes.slice(1));
            
            const mesStart = new Date(dataBase.getFullYear(), dataBase.getMonth(), 1);
            const mesEnd = new Date(dataBase.getFullYear(), dataBase.getMonth() + 1, 0);

            // Filtra localmente os cb para o mês e soma os pontos
            let ptsMes = todosCbSL.reduce((acc, cb) => {
                const dt = new Date(cb.DATA_ATRIBUICAO_BADGE);
                if (dt >= mesStart && dt <= mesEnd) {
                    return acc + (cb.Badge?.PONTOS_BADGE || 0);
                }
                return acc;
            }, 0);
            ptsMes += marcosSL.reduce((acc, mc) => {
                if (!mc.DATA_CONQUISTA) return acc;
                const dt = new Date(mc.DATA_CONQUISTA);
                return dt >= mesStart && dt <= mesEnd
                    ? acc + (marcosPorId.get(mc.ID_MARCO)?.PONTOS_EXTRA || 0)
                    : acc;
            }, 0);

            dadosLinha.push(ptsMes);
        }

        // 3. Top Consultores e Cálculo de Pontos Exclusivo da SL
        let totalPontosSL = 0;
        let badgesTotaisSL = 0;
        let numConsultoresComBadge = 0;
        const rankingMap = {};
        
        statsSL.forEach(stat => {
            totalPontosSL += stat.pontosCalculados;
            badgesTotaisSL += stat.badgesCalculados;
            if (stat.badgesCalculados > 0) {
                numConsultoresComBadge++;
            }
            rankingMap[stat.consultor.ID_CONSULTOR] = {
                id: stat.consultor.ID_CONSULTOR,
                nome: stat.consultor.Utilizador?.NOME_COMPLETO_UTILIZADOR || 'Anónimo',
                badges: stat.badgesCalculados,
                pontos: stat.pontosCalculados
            };
        });

        // Extrai e ordena o Top 5
        const topConsultores = Object.values(rankingMap)
            .sort((a, b) => b.pontos - a.pontos)
            .slice(0, 5);

        const slModel = await ServiceLine.findOne({ where: { NOME_SERVICE_LINE: serviceLine } });
        const areasDaSL = slModel
            ? await Area.findAll({ where: { ID_SERVICE_LINE: slModel.ID_SERVICE_LINE } })
            : [];
        const nomesAreasDaSL = new Set(areasDaSL.map(a => a.NOME_AREA));
        const formatAreaLabel = (areaName, serviceLineBadge) => {
            if (!areaName || areaName === 'Sem Área') return areaName || 'Sem Área';
            return serviceLineBadge && serviceLineBadge !== serviceLine && !nomesAreasDaSL.has(areaName)
                ? `${areaName} (Service Line externa)`
                : areaName;
        };

        // Prepara dinamicamente o Doughnut
        const countAreas = {};
        const consultoresSL_Badges = todosCbSL;
        
        consultoresSL_Badges.forEach(cb => {
            let areaName = cb.Badge?.NOME_BADGE || 'Sem Área';
            let serviceLineBadge = serviceLine;
            try {
                if (cb.Badge?.CATEGORIA_BADGE?.startsWith('{')) {
                    const catObj = JSON.parse(cb.Badge.CATEGORIA_BADGE);
                    if (catObj.area) areaName = catObj.area;
                    if (catObj.serviceLine) serviceLineBadge = catObj.serviceLine;
                }
            } catch(e) {}
            areaName = formatAreaLabel(areaName, serviceLineBadge);
            countAreas[areaName] = (countAreas[areaName] || 0) + 1;
        });

        const doughnutLabels = [];
        const doughnutValues = [];
        Object.keys(countAreas).forEach(k => {
            if (countAreas[k] > 0) {
                doughnutLabels.push(k);
                doughnutValues.push(countAreas[k]);
            }
        });
        
        // Se a SL for completamente nova, garantir o fallback para não quebrar o gráfico
        if(doughnutLabels.length === 0) {
            doughnutLabels.push('Sem Badges');
            doughnutValues.push(1);
        }

        const totalConsultoresSL = statsSL.length;
        const percComBadge = totalConsultoresSL > 0 ? Math.round((numConsultoresComBadge / totalConsultoresSL) * 100) : 0;
        const mediaPontos = totalConsultoresSL > 0 ? Math.round(totalPontosSL / totalConsultoresSL) : 0;

        // Calculo da Taxa de Crescimento dos Badges
        const badgesMesPassado = dadosLinha[4] || 0;
        const badgesMesAtual = dadosLinha[5] || 0;
        let crescimentoBadges = '+0%';
        if (badgesMesPassado === 0 && badgesMesAtual > 0) {
            crescimentoBadges = '+100%';
        } else if (badgesMesPassado > 0) {
            const diff = badgesMesAtual - badgesMesPassado;
            const perc = Math.round((diff / badgesMesPassado) * 100);
            crescimentoBadges = (perc >= 0 ? '+' : '') + perc + '%';
        }

        // 4. Sistema Dinâmico de Alertas
        const expiracoes = await ConsultorBadge.count({
            where: { 
                DATA_EXPIRACAO: { 
                    [Op.not]: null, 
                    [Op.gt]: new Date(), 
                    [Op.lte]: new Date(new Date().setDate(new Date().getDate() + 30)) 
                } 
            },
            include: [{ model: Badge, where: filtroBadgeSL }]
        });

        const [aprovados, rejeitados] = await Promise.all([
            Pedido.count({
                where: { ESTADO_PEDIDO: 'Aceite', ID_SLL: { [Op.ne]: null } },
                include: [{ model: Badge, where: filtroBadgeSL }]
            }),
            Pedido.count({
                where: { ESTADO_PEDIDO: 'Recusado', ID_SLL: { [Op.ne]: null } },
                include: [{ model: Badge, where: filtroBadgeSL }]
            })
        ]);
        const totalDecididos = aprovados + rejeitados;
        const taxaAprovacao = totalDecididos ? `${Math.round((aprovados / totalDecididos) * 100)}%` : '0%';

        const alertas = [];
        if (expiracoes > 0) {
            alertas.push({
                tipo: 'warning',
                titulo: 'Badges próximos da expiração',
                mensagem: `${expiracoes} badge${expiracoes === 1 ? '' : 's'} da sua Service Line expira${expiracoes === 1 ? '' : 'm'} nos próximos 30 dias.`,
                dataRaw: Date.now(),
                dataStr: 'Atualizado agora',
                icone: 'bi-hourglass-split',
                corIcone: '#dc3545',
                tipoCSS: 'border-danger bg-danger bg-opacity-10',
                link: '/sll/badges/expiracao'
            });
        }

        // Buscar Avisos (Admin)
        try {
            const avisosAtivos = await AvisoGeral.findAll({
                where: {
                    ESTADO_AVISO: 'Ativo',
                    [Op.or]: [
                        { VISIBILIDADE_AVISO: 'Todos' },
                        { VISIBILIDADE_AVISO: 'Service Line Leader' },
                        { VISIBILIDADE_AVISO: 'SLL' }
                    ]
                },
                order: [['DATA_PUBLICACAO_AVISO', 'DESC']],
            });
            avisosAtivos.forEach(a => {
                const critico = a.TIPO_NOTIFICACAO === 'Crítico';
                const data = new Date(a.DATA_PUBLICACAO_AVISO);
                alertas.push({
                    tipo: critico ? 'warning' : 'aviso',
                    titulo: a.TITULO_AVISO,
                    mensagem: a.CONTEUDO_AVISO || 'Aviso geral da administração.',
                    dataRaw: data.getTime(),
                    dataStr: data.toLocaleDateString('pt-PT'),
                    icone: critico ? 'bi-exclamation-triangle-fill' : 'bi-megaphone-fill',
                    corIcone: critico ? '#dc3545' : '#ffc107',
                    tipoCSS: critico
                        ? 'border-danger bg-danger bg-opacity-10'
                        : 'border-warning bg-warning bg-opacity-10',
                    link: '#'
                });
            });
        } catch(e) {}

        // Buscar Notificações do SLL
        const idUtilizadorAtivo = req.userId || id;
        if (idUtilizadorAtivo) {
            try {
                const notifs = await Notificacao.findAll({
                    where: { ID_UTILIZADOR: idUtilizadorAtivo },
                    order: [['DATA_ENVIO_NOTIFICACAO', 'DESC']],
                });
                notifs.forEach(n => {
                    const tipo = String(n.TIPO_NOTIFICACAO || 'info').toLowerCase();
                    const alerta = tipo.includes('alert') || tipo.includes('warning') || tipo.includes('critical');
                    const sucesso = tipo.includes('success') || tipo.includes('accepted');
                    const data = new Date(n.DATA_ENVIO_NOTIFICACAO);
                    alertas.push({
                        tipo: alerta ? 'warning' : (sucesso ? 'success' : 'info'),
                        titulo: n.TITULO_NOTIFICACAO,
                        mensagem: n.MENSAGEM_NOTIFICACAO || 'Nova notificação da plataforma.',
                        dataRaw: data.getTime(),
                        dataStr: data.toLocaleString('pt-PT'),
                        icone: alerta
                            ? 'bi-exclamation-circle-fill'
                            : (sucesso ? 'bi-check-circle-fill' : 'bi-bell-fill'),
                        corIcone: alerta ? '#dc3545' : (sucesso ? '#198754' : '#0d6efd'),
                        tipoCSS: alerta
                            ? 'border-danger bg-danger bg-opacity-10'
                            : (sucesso
                                ? 'border-success bg-success bg-opacity-10'
                                : 'border-info bg-info bg-opacity-10'),
                        link: '#'
                    });
                });
            } catch(e) {}
        }
        
        const alertasFinais = alertas.sort((a, b) => b.dataRaw - a.dataRaw);

        res.json({
            success: true,
            data: {
                stats: {
                    badgesMes: dadosLinha[5],
                    crescimentoBadges: crescimentoBadges,
                    consultoresAtivos: numConsultoresComBadge,
                    totalPontos: totalPontosSL,
                    mediaPontos: mediaPontos,
                    percComBadge: percComBadge,
                    taxaAprovacao
                },
                graficoLinha: { labels: labelsLinha, valores: dadosLinha },
                graficoDoughnut: { labels: doughnutLabels, valores: doughnutValues },
                pedidosPendentes,
                alertas: alertasFinais,
                topConsultores
            }
        });

    } catch (error) {
        console.error("Erro Dashboard SLL:", error);
        res.status(500).json({ success: false, message: error.message });
    }
};

module.exports = controllers;
