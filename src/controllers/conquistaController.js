const MarcoConquista = require('../models/MarcoConquista');
const MarcoConsultor = require('../models/MarcoConsultor');
const Consultor = require('../models/Consultor');
const ConsultorBadge = require('../models/ConsultorBadge');
const { Op } = require('sequelize');
const Utilizador = require('../models/Utilizador');
const PDFDocument = require('pdfkit');
const SVGtoPDF = require('svg-to-pdfkit');
const fs = require('fs');
const path = require('path');
const LogAtividadeSistema = require('../models/LogAtividadeSistema');
const pushService = require('../services/pushService');
const HistoricoPontuacao = require('../models/HistoricoPontuacao');
const mailer = require('../config/mailer');
const http = require('http');
const https = require('https');

const dataCriacaoMarco = marco => marco.DATA_CRIACAO_MARCO ? new Date(marco.DATA_CRIACAO_MARCO) : new Date(0);
const addDias = (data, dias) => {
    const d = new Date(data);
    d.setDate(d.getDate() + Number(dias || 0));
    return d;
};
const addMeses = (data, meses) => {
    const d = new Date(data);
    d.setMonth(d.getMonth() + Number(meses || 0));
    return d;
};
const janelaMarco = marco => {
    if (marco.TIPO_MARCO === 'BADGES_DIAS') {
        const inicio = dataCriacaoMarco(marco);
        return { inicio, fim: addDias(inicio, marco.PARAMETRO_2 || 0) };
    }
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
const janelaTerminou = marco => {
    const janela = janelaMarco(marco);
    return janela ? new Date() >= janela.fim : false;
};
const diasRestantesMarco = marco => {
    const janela = janelaMarco(marco);
    if (!janela) return null;
    return Math.max(0, Math.ceil((janela.fim - new Date()) / (1000 * 60 * 60 * 24)));
};
const prazoLabelMarco = marco => {
    const dias = diasRestantesMarco(marco);
    if (dias === null) return null;
    if (dias === 0) return 'Último dia';
    return `Faltam ${dias} ${dias === 1 ? 'dia' : 'dias'}`;
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

const atribuirMarcoAoConsultor = async (marco, consultor, idUtilizador) => {
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
        ID_UTILIZADOR: idUtilizador,
        DATA_ATRIBUICAO: new Date(),
        PONTOS_OBTIDOS: marco.PONTOS_EXTRA || 0,
        ORIGEM_PONTOS: `Badge premium: ${marco.TITULO_MARCO}`
    });
    await LogAtividadeSistema.create({ ID_UTILIZADOR: idUtilizador, TIPO_ATIVIDADE: 'Badge Premium Obtido', DETALHES_ATIVIDADE: `Ganhou automaticamente o badge premium ${marco.TITULO_MARCO}`, DATA_HORA_ATIVIDADE: new Date() });
    const mensagemPremium = [
        `Parabéns, obteve a conquista especial "${marco.TITULO_MARCO}"!`,
        `Esta conquista premium foi atribuída automaticamente por cumprir a regra definida na plataforma.`,
        `Pontos bónus adicionados: +${marco.PONTOS_EXTRA || 0}.`,
        'Para consultar esta conquista, aceda a Conquistas Especiais.',
        'As conquistas especiais aparecem com destaque dourado e podem ser consultadas, partilhadas e validadas através da página pública.'
    ].join('\n\n');
    pushService.sendPush(idUtilizador, 'success', 'Novo Badge Premium Obtido', mensagemPremium, 'badges', 'Consultor');
    try {
        const utilizador = await Utilizador.findByPk(idUtilizador);
        if (utilizador) {
            await mailer.sendEmail(
                utilizador.EMAIL_UTILIZADOR,
                'Novo Badge Premium Obtido - Plataforma de Badges Softinsa',
                `<h2>Novo Badge Premium Obtido</h2><p>Olá, ${utilizador.NOME_COMPLETO_UTILIZADOR}.</p>${mensagemPremium.split('\n\n').map(paragrafo => `<p>${paragrafo}</p>`).join('')}`,
                'badges',
                utilizador.PERFIL_UTILIZADOR
            );
        }
    } catch (mailErr) {
        console.error('Falha ao enviar email de badge premium obtido:', mailErr);
    }
    return true;
};

const processarRankingSeTerminado = async (marco) => {
    if (!['MELHOR_ANO', 'MELHOR_MESES'].includes(marco.TIPO_MARCO) || !janelaTerminou(marco)) return;
    const jaAtribuido = await MarcoConsultor.findOne({ where: { ID_MARCO: marco.ID_MARCO } });
    if (jaAtribuido) return;
    const janela = janelaMarco(marco);
    const consultores = await Consultor.findAll();
    let vencedor = null;
    let maiorPontuacao = -1;
    for (const c of consultores) {
        const pontos = await pontosPeriodo(c.ID_UTILIZADOR, janela.inicio, janela.fim);
        if (pontos > maiorPontuacao || (pontos === maiorPontuacao && vencedor && c.ID_CONSULTOR < vencedor.ID_CONSULTOR)) {
            vencedor = c;
            maiorPontuacao = pontos;
        }
    }
    if (vencedor && maiorPontuacao > 0) {
        await atribuirMarcoAoConsultor(marco, vencedor, vencedor.ID_UTILIZADOR);
    }
};

const desenharEstrelaDourada = (doc, centroX, centroY, raioExterno = 30, raioInterno = 13) => {
    const pontos = [];
    for (let i = 0; i < 10; i++) {
        const angulo = -Math.PI / 2 + (i * Math.PI / 5);
        const raio = i % 2 === 0 ? raioExterno : raioInterno;
        pontos.push([centroX + Math.cos(angulo) * raio, centroY + Math.sin(angulo) * raio]);
    }
    doc.moveTo(pontos[0][0], pontos[0][1]);
    pontos.slice(1).forEach(([x, y]) => doc.lineTo(x, y));
    doc.closePath().fillAndStroke('#D4AF37', '#8B6914');
};

const fetchImage = (url) => {
    return new Promise((resolve, reject) => {
        if (!url || typeof url !== 'string' || !url.startsWith('http')) return reject('Invalid URL');
        const client = url.startsWith('https') ? https : http;
        const options = { headers: { 'User-Agent': 'Mozilla/5.0' } };
        client.get(url, options, (res) => {
            if (res.statusCode !== 200) {
                if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                    return fetchImage(res.headers.location).then(resolve).catch(reject);
                }
                return reject(`Failed to fetch image: ${res.statusCode}`);
            }
            const data = [];
            res.on('data', chunk => data.push(chunk));
            res.on('end', () => resolve(Buffer.concat(data)));
        }).on('error', reject);
    });
};

const controllers = {};

controllers.getConquistasConsultor = async (req, res) => {
    try {
        const { idUtilizador } = req.params;
        const consultor = await Consultor.findOne({ where: { ID_UTILIZADOR: idUtilizador } });
        
        if (!consultor) {
            return res.json({ success: true, obtidas: [], disponiveis: [] });
        }
        
        // 1. Ir buscar todas as conquistas possíveis
        const todosMarcos = await MarcoConquista.findAll();
        
        // 2. Ir buscar as que o consultor já ganhou
        const ganhos = await MarcoConsultor.findAll({ where: { ID_CONSULTOR: consultor.ID_CONSULTOR } });
        const idsGanhos = ganhos.map(g => g.ID_MARCO);

        const obtidas = [];
        const disponiveis = [];

        // AUTO-HEALING (Lazy Gamification Evaluation)
        let totalBadgesCache = null;
        let requiresUpdate = false;
        let currentPoints = consultor.PONTUACAO_TOTAL || 0;

        for (const m of todosMarcos) {
            await processarRankingSeTerminado(m);

            const item = {
                id: m.ID_MARCO,
                titulo: m.TITULO_MARCO,
                descricao: m.DESCRICAO_MARCO,
                bonus: m.PONTOS_EXTRA,
                imagem: m.URL_IMAGEM_MARCO,
                tipo: m.TIPO_MARCO,
                diasRestantes: diasRestantesMarco(m),
                prazoLabel: prazoLabelMarco(m)
            };

            const infoGanhoAtual = idsGanhos.includes(m.ID_MARCO)
                ? ganhos.find(g => g.ID_MARCO == m.ID_MARCO)
                : await MarcoConsultor.findOne({ where: { ID_CONSULTOR: consultor.ID_CONSULTOR, ID_MARCO: m.ID_MARCO } });

            if (infoGanhoAtual) {
                const infoGanho = infoGanhoAtual;
                item.data = new Date(infoGanho.DATA_CONQUISTA).toLocaleDateString('pt-PT');
                obtidas.push(item);
            } else {
                // Verificar se deveria ter ganho mas o sistema não detetou antes
                let ganhouAgora = false;
                
                if (m.TIPO_MARCO === 'TOTAL_BADGES') {
                    if (totalBadgesCache === null) {
                        totalBadgesCache = await ConsultorBadge.count({ where: { ID_CONSULTOR: consultor.ID_CONSULTOR }});
                    }
                    if (totalBadgesCache >= m.PARAMETRO_1) ganhouAgora = true;
                }
                else if (m.TIPO_MARCO === 'BADGES_DIAS') {
                    const janela = janelaMarco(m);
                    if (janela && new Date() < janela.fim) {
                        const badgesNoPeriodo = await ConsultorBadge.count({
                            where: {
                                ID_CONSULTOR: consultor.ID_CONSULTOR,
                                DATA_ATRIBUICAO_BADGE: { [Op.gte]: janela.inicio, [Op.lt]: janela.fim }
                            }
                        });
                        item.progressoLabel = `${badgesNoPeriodo} / ${m.PARAMETRO_1} Badges`;
                        if (badgesNoPeriodo >= m.PARAMETRO_1) ganhouAgora = true;
                    } else {
                        item.indisponivel = true;
                        item.progressoLabel = 'Já não é possível obter';
                    }
                }
                else if (['MELHOR_ANO', 'MELHOR_MESES'].includes(m.TIPO_MARCO) && janelaTerminou(m)) {
                    item.indisponivel = true;
                    item.progressoLabel = 'Já não é possível obter';
                }
                else if (['MELHOR_ANO', 'MELHOR_MESES'].includes(m.TIPO_MARCO)) {
                    const totalConsultores = await Consultor.count();
                    const janela = janelaMarco(m);
                    const pontosAtual = janela ? await pontosPeriodo(idUtilizador, janela.inicio, new Date()) : currentPoints;
                    const todosConsultores = await Consultor.findAll();
                    let consultoresAbaixo = 0;
                    for (const c of todosConsultores) {
                        if (c.ID_CONSULTOR === consultor.ID_CONSULTOR) continue;
                        const pontosOutro = janela ? await pontosPeriodo(c.ID_UTILIZADOR, janela.inicio, new Date()) : (Number(c.PONTUACAO_TOTAL) || 0);
                        if (pontosOutro < pontosAtual) consultoresAbaixo++;
                    }
                    const progressoRanking = totalConsultores > 1
                        ? Math.round((consultoresAbaixo / (totalConsultores - 1)) * 100)
                        : 100;
                    item.progressoValor = Math.min(progressoRanking, 100);
                    item.progressoLabel = `À frente de ${item.progressoValor}% dos consultores`;
                }
                else if (m.TIPO_MARCO === 'TOTAL_PONTOS') {
                    if (currentPoints >= m.PARAMETRO_1) ganhouAgora = true;
                    item.progressoLabel = `${currentPoints} / ${m.PARAMETRO_1} Pontos`;
                }
                else if (!m.TIPO_MARCO && m.REGRA_ATRIBUICAO && m.REGRA_ATRIBUICAO.toLowerCase().includes('pontos')) {
                    // Legacy logic for points
                    const match = m.REGRA_ATRIBUICAO.match(/\d+/);
                    if (match) {
                        const pontosAlvo = parseInt(match[0], 10);
                        if (currentPoints >= pontosAlvo) ganhouAgora = true;
                    }
                }

                if (ganhouAgora) {
                    await atribuirMarcoAoConsultor(m, consultor, idUtilizador);
                    currentPoints += m.PONTOS_EXTRA;
                    requiresUpdate = true;
                    item.data = new Date().toLocaleDateString('pt-PT');
                    obtidas.push(item);
                } else {
                    disponiveis.push(item);
                }
            }
        }

        if (requiresUpdate) {
            await consultor.update({ PONTUACAO_TOTAL: currentPoints });
        }

        res.json({ success: true, obtidas, disponiveis });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: 'Ocorreu um erro inesperado. Tente novamente mais tarde.' });
    }
};

controllers.getDetalhesConquista = async (req, res) => {
    try {
        const { idUtilizador, idMarco } = req.params;
        const consultor = await Consultor.findOne({ where: { ID_UTILIZADOR: idUtilizador } });
        const marco = await MarcoConquista.findByPk(idMarco);
        
        if (!marco) return res.status(404).json({ success: false, message: "Conquista não encontrada." });
        if (!consultor) return res.status(404).json({ success: false, message: "Consultor não encontrado." });
        
        const conquistaGanha = await MarcoConsultor.findOne({ 
            where: { ID_CONSULTOR: consultor.ID_CONSULTOR, ID_MARCO: idMarco } 
        });

        // ===================================
        // LÓGICA DE PROGRESSO ESTIMADO
        // ===================================
        let progValor = 0;
        let progTexto = 'Em curso';
        let indisponivel = false;

        if (!conquistaGanha) {
            await processarRankingSeTerminado(marco);
            const ganhoDepoisProcessamento = await MarcoConsultor.findOne({
                where: { ID_CONSULTOR: consultor.ID_CONSULTOR, ID_MARCO: idMarco }
            });
            if (ganhoDepoisProcessamento) {
                progValor = 100;
                progTexto = 'Conquista obtida';
            }
            else if (marco.TIPO_MARCO === 'TOTAL_BADGES') {
                const totalBadges = await ConsultorBadge.count({ where: { ID_CONSULTOR: consultor.ID_CONSULTOR }});
                progValor = Math.min((totalBadges / marco.PARAMETRO_1) * 100, 100);
                progTexto = `${totalBadges} / ${marco.PARAMETRO_1} Badges`;
            } 
            else if (marco.TIPO_MARCO === 'BADGES_DIAS') {
                const janela = janelaMarco(marco);
                if (janela && new Date() >= janela.fim) {
                    progValor = 0;
                    progTexto = 'Já não é possível obter';
                    indisponivel = true;
                } else {
                    const badgesNoPeriodo = await ConsultorBadge.count({
                        where: {
                            ID_CONSULTOR: consultor.ID_CONSULTOR,
                            DATA_ATRIBUICAO_BADGE: { [Op.gte]: janela.inicio, [Op.lt]: janela.fim }
                        }
                    });
                    progValor = Math.min((badgesNoPeriodo / marco.PARAMETRO_1) * 100, 100);
                    progTexto = `${badgesNoPeriodo} / ${marco.PARAMETRO_1} Badges até ${janela.fim.toLocaleDateString('pt-PT')}`;
                }
            }
            else if (marco.TIPO_MARCO === 'MELHOR_ANO' || marco.TIPO_MARCO === 'MELHOR_MESES') {
                const janela = janelaMarco(marco);
                if (janela && new Date() >= janela.fim) {
                    progValor = 0;
                    progTexto = 'Já não é possível obter';
                    indisponivel = true;
                } else {
                    const totalConsultores = await Consultor.count();
                    const pontosAtual = janela ? await pontosPeriodo(idUtilizador, janela.inicio, new Date()) : (consultor.PONTUACAO_TOTAL || 0);
                    const todosConsultores = await Consultor.findAll();
                    let abaixo = 0;
                    for (const c of todosConsultores) {
                        if (c.ID_CONSULTOR === consultor.ID_CONSULTOR) continue;
                        const pontosOutro = janela ? await pontosPeriodo(c.ID_UTILIZADOR, janela.inicio, new Date()) : (c.PONTUACAO_TOTAL || 0);
                        if (pontosOutro < pontosAtual) abaixo++;
                    }
                    progValor = totalConsultores > 1 ? (abaixo / (totalConsultores - 1)) * 100 : 100;
                    progTexto = `À frente de ${Math.round(progValor)}% dos consultores`;
                }
            }
            else if (marco.TIPO_MARCO === 'TOTAL_PONTOS') {
                progValor = Math.min(( (consultor.PONTUACAO_TOTAL || 0) / marco.PARAMETRO_1) * 100, 100);
                progTexto = `${consultor.PONTUACAO_TOTAL || 0} / ${marco.PARAMETRO_1} Pontos`;
            }
            else if (!marco.TIPO_MARCO && marco.REGRA_ATRIBUICAO && marco.REGRA_ATRIBUICAO.toLowerCase().includes('pontos')) {
                const match = marco.REGRA_ATRIBUICAO.match(/\d+/);
                if (match) {
                    const pontosAlvo = parseInt(match[0], 10);
                    progValor = Math.min(( (consultor.PONTUACAO_TOTAL || 0) / pontosAlvo) * 100, 100);
                    progTexto = `${consultor.PONTUACAO_TOTAL || 0} / ${pontosAlvo} Pontos`;
                }
            }
        }

        let regrasFormatadas = marco.REGRA_ATRIBUICAO || 'Complete os objetivos desta conquista especial.';
        if (marco.TIPO_MARCO === 'TOTAL_PONTOS') {
            regrasFormatadas = `Acumule um total de ${marco.PARAMETRO_1} pontos na plataforma. Cada badge aprovado adiciona pontos à sua pontuação total.`;
        } else if (marco.TIPO_MARCO === 'TOTAL_BADGES') {
            regrasFormatadas = `Obtenha um total de ${marco.PARAMETRO_1} badge${marco.PARAMETRO_1 > 1 ? 's' : ''} aprovados na plataforma. Cada badge aprovado pelo seu Talent Manager conta para este total.`;
        } else if (marco.TIPO_MARCO === 'BADGES_DIAS') {
            regrasFormatadas = `Obtenha ${marco.PARAMETRO_1} badge${marco.PARAMETRO_1 > 1 ? 's' : ''} num período de ${marco.PARAMETRO_2} dias consecutivos. Os badges têm que ser todos aprovados dentro deste intervalo de tempo.`;
        } else if (marco.TIPO_MARCO === 'MELHOR_ANO') {
            regrasFormatadas = `Seja o consultor com mais pontos acumulados no ano civil de ${marco.PARAMETRO_1}. O ranking é processado pelo administrador no final do ano e o título é atribuído automaticamente.`;
        } else if (marco.TIPO_MARCO === 'MELHOR_MESES') {
            regrasFormatadas = `Seja o consultor com mais pontos acumulados durante ${marco.PARAMETRO_1} mes${marco.PARAMETRO_1 > 1 ? 'es' : ''} consecutivos. O ranking é avaliado periodicamente pelo administrador.`;
        } else if (!marco.TIPO_MARCO && marco.REGRA_ATRIBUICAO && marco.REGRA_ATRIBUICAO.toLowerCase().includes('pontos')) {
            const match = marco.REGRA_ATRIBUICAO.match(/\d+/);
            if (match) {
                regrasFormatadas = `Acumule um total de ${match[0]} pontos na plataforma.`;
            }
        }

        res.json({
            success: true,
            data: {
                id: marco.ID_MARCO,
                titulo: marco.TITULO_MARCO,
                descricao: marco.DESCRICAO_MARCO,
                regras: regrasFormatadas,
                bonus: marco.PONTOS_EXTRA,
                raridade: marco.TIPO_MARCO ? marco.TIPO_MARCO.replace('_', ' ') : 'ESPECIAL',
                imagem: marco.URL_IMAGEM_MARCO,
                urlImagem: marco.URL_IMAGEM_MARCO,
                img: marco.URL_IMAGEM_MARCO,
                obtida: !!conquistaGanha,
                data: conquistaGanha ? new Date(conquistaGanha.DATA_CONQUISTA).toLocaleDateString('pt-PT') : null,
                tipo: marco.TIPO_MARCO,
                diasRestantes: diasRestantesMarco(marco),
                prazoLabel: prazoLabelMarco(marco),
                indisponivel,
                progressoValor: Math.round(progValor),
                progressoLabel: progTexto
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Ocorreu um erro inesperado. Tente novamente mais tarde.' });
    }
};

// Listar todas as conquistas de forma global (SLL e Admin)
controllers.getAllConquistasGlobal = async (req, res) => {
    try {
        const marcos = await MarcoConquista.findAll();
        const formatados = marcos.map(m => ({
            id: m.ID_MARCO,
            titulo: m.TITULO_MARCO,
            desc: m.DESCRICAO_MARCO,
            bonus: m.PONTOS_EXTRA,
            // Lógica de raridade baseada nos pontos
            raridade: m.PONTOS_EXTRA >= 1000 ? 'Lendário' : (m.PONTOS_EXTRA >= 500 ? 'Épico' : 'Raro'),
            icon: 'bi-trophy-fill', // Pode ser dinâmico se tiver coluna de ícone
            img: m.URL_IMAGEM_MARCO
        }));
        res.json({ success: true, data: formatados });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Ocorreu um erro inesperado. Tente novamente mais tarde.' });
    }
};

// Detalhes de uma conquista sem contexto de utilizador
controllers.getDetalhesConquistaGlobal = async (req, res) => {
    try {
        const { idMarco } = req.params;
        const marco = await MarcoConquista.findByPk(idMarco);
        
        if (!marco) return res.status(404).json({ success: false, message: "Conquista não encontrada" });

        res.json({
            success: true,
            data: {
                id: marco.ID_MARCO,
                titulo: marco.TITULO_MARCO,
                descricao: marco.DESCRICAO_MARCO,
                regras: marco.REGRA_ATRIBUICAO,
                bonus: marco.PONTOS_EXTRA,
                raridade: marco.PONTOS_EXTRA >= 1000 ? 'Lendário' : (marco.PONTOS_EXTRA >= 500 ? 'Épico' : 'Raro'),
                icon: 'bi-trophy-fill',
                img: marco.URL_IMAGEM_MARCO,
                impacto: 'Alta visibilidade no perfil e bónus de pontos para o ranking.'
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Ocorreu um erro inesperado. Tente novamente mais tarde.' });
    }
};

controllers.downloadCertificadoConquista = async (req, res) => {
    try {
        const { idUtilizador, idMarco } = req.params;

        const consultor = await Consultor.findOne({ 
            where: { ID_UTILIZADOR: idUtilizador },
            include: [{ model: Utilizador }]
        });
        if (!consultor) return res.status(404).json({ success: false, message: "Consultor não encontrado." });

        const marco = await MarcoConquista.findByPk(idMarco);
        if (!marco) return res.status(404).json({ success: false, message: "Conquista não encontrada." });

        const conquistaGanha = await MarcoConsultor.findOne({ 
            where: { ID_CONSULTOR: consultor.ID_CONSULTOR, ID_MARCO: idMarco } 
        });

        if (!conquistaGanha) return res.status(403).json({ success: false, message: "O consultor ainda não obteve esta conquista." });

        const doc = new PDFDocument({
            size: 'A4',
            layout: 'landscape',
            margins: { top: 50, bottom: 50, left: 50, right: 50 }
        });

        res.setHeader('Content-disposition', `attachment; filename="Certificado_Conquista_Softinsa_${marco.TITULO_MARCO.replace(/\s+/g, '_')}.pdf"`);
        res.setHeader('Content-type', 'application/pdf');

        doc.pipe(res);

        // Estilo do PDF
        doc.rect(20, 20, 802, 555).stroke('#084298');
        doc.rect(25, 25, 792, 545).stroke('#D4AF37'); // Dourado para conquistas

        doc.fontSize(40).fillColor('#D4AF37').text('CERTIFICADO DE CONQUISTA ESPECIAL', { align: 'center' });
        doc.moveDown(1);

        doc.fontSize(20).fillColor('#333333').text('Reconhece-se que', { align: 'center' });
        doc.moveDown(0.5);

        doc.fontSize(30).fillColor('#084298').text(consultor.Utilizador.NOME_COMPLETO_UTILIZADOR, { align: 'center' });
        doc.moveDown(1);

        doc.fontSize(16).fillColor('#333333').text('Alcançou o marco extraordinário de:', { align: 'center' });
        doc.moveDown(0.5);

        doc.fontSize(25).fillColor('#D4AF37').text(marco.TITULO_MARCO, { align: 'center' });
        doc.moveDown(0.5);

        // Imagem própria ou estrela dourada padrão.
        try {
            const imgUrl = marco.URL_IMAGEM_MARCO && marco.URL_IMAGEM_MARCO.trim() !== '' && !marco.URL_IMAGEM_MARCO.includes('dummy')
                ? marco.URL_IMAGEM_MARCO
                : null;
            let imgBuffer;

            if (imgUrl) {
                if (imgUrl.includes('/uploads/')) {
                    imgBuffer = fs.readFileSync(path.join(__dirname, '../../uploads', path.basename(imgUrl)));
                } else
                if (imgUrl.startsWith('data:image')) {
                    const base64Data = imgUrl.replace(/^data:image\/\w+;base64,/, "");
                    imgBuffer = Buffer.from(base64Data, 'base64');
                } else {
                    imgBuffer = await fetchImage(imgUrl);
                }
            }
            
            const imgSize = 50; 
            const imgX = (doc.page.width - imgSize) / 2;
            const imgY = doc.y;

            if (imgBuffer) {
                doc.circle(imgX + imgSize/2, imgY + imgSize/2, 35).lineWidth(2).stroke('#D4AF37');
                const conteudoInicial = imgBuffer.subarray(0, 300).toString('utf8');
                const imagemSvg = /\.svg(?:$|\?)/i.test(imgUrl) || /<svg[\s>]/i.test(conteudoInicial);
                if (imagemSvg) {
                    SVGtoPDF(doc, imgBuffer.toString('utf8'), imgX, imgY, {
                        width: imgSize,
                        height: imgSize,
                        preserveAspectRatio: 'xMidYMid meet'
                    });
                } else {
                    doc.image(imgBuffer, imgX, imgY, { width: imgSize, height: imgSize, fit: [imgSize, imgSize], align: 'center', valign: 'center' });
                }
            } else {
                desenharEstrelaDourada(doc, doc.page.width / 2, imgY + 30);
            }
            doc.y += 75; 
        } catch(e) {
            console.log("Erro ao carregar imagem para o PDF:", e);
            desenharEstrelaDourada(doc, doc.page.width / 2, doc.y + 30);
            doc.y += 75;
        }

        const dataEmissao = new Date(conquistaGanha.DATA_CONQUISTA).toLocaleDateString('pt-PT');
        doc.fontSize(14).fillColor('#555555').text(`Data de Obtenção: ${dataEmissao}`, { align: 'center' });
        doc.text(`Recompensa: +${marco.PONTOS_EXTRA} Pontos`, { align: 'center' });
        
        doc.moveDown(1);
        
        doc.fontSize(12).fillColor('#333').text(`Categoria: Conquista Especial Softinsa`, { align: 'center' });
        doc.moveDown(0.5);
        
        const frontendUrl = (process.env.FRONTEND_URL || process.env.PUBLIC_APP_URL || 'http://localhost:5173').replace(/\/$/, '');
        doc.fontSize(10).fillColor('#999999').text(`Link de Verificação Oficial: ${frontendUrl}/verificacao-especial/${idUtilizador}/${marco.ID_MARCO}`, { align: 'center' });

        doc.addPage();
        doc.rect(20, 20, 802, 555).stroke('#084298');
        doc.rect(25, 25, 792, 545).stroke('#D4AF37');
        doc.fontSize(28).fillColor('#D4AF37').text('DETALHES DA CONQUISTA ESPECIAL', { align: 'center' });
        doc.moveDown(1);
        doc.fontSize(20).fillColor('#084298').text(marco.TITULO_MARCO, { align: 'center' });
        doc.moveDown(1);
        doc.fontSize(12).fillColor('#333333')
            .text(`Descrição: ${marco.DESCRICAO_MARCO || 'Sem descrição adicional.'}`)
            .moveDown(0.8)
            .text(`Regra de atribuição: ${marco.REGRA_ATRIBUICAO || 'Conquista atribuída segundo os critérios definidos pela Softinsa.'}`)
            .moveDown(0.5)
            .text(`Tipo de conquista: ${marco.TIPO_MARCO || 'Especial'}`)
            .text(`Recompensa: ${marco.PONTOS_EXTRA || 0} pontos`)
            .text(`Data de obtenção: ${dataEmissao}`);

        doc.end();

    } catch (error) {
        console.error("Erro PDF Conquista:", error);
        res.status(500).json({ success: false, message: 'Ocorreu um erro inesperado. Tente novamente mais tarde.' });
    }
};

module.exports = controllers;
