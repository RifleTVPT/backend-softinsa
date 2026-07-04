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
const http = require('http');
const https = require('https');

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
            const item = {
                id: m.ID_MARCO,
                titulo: m.TITULO_MARCO,
                descricao: m.DESCRICAO_MARCO,
                bonus: m.PONTOS_EXTRA,
                imagem: m.URL_IMAGEM_MARCO
            };

            if (idsGanhos.includes(m.ID_MARCO)) {
                const infoGanho = ganhos.find(g => g.ID_MARCO == m.ID_MARCO);
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
                    const diasAlvo = m.PARAMETRO_2;
                    const dataLimite = new Date();
                    dataLimite.setDate(dataLimite.getDate() - diasAlvo);
                    const badgesNoPeriodo = await ConsultorBadge.count({
                        where: { ID_CONSULTOR: consultor.ID_CONSULTOR, DATA_ATRIBUICAO_BADGE: { [Op.gte]: dataLimite } }
                    });
                    if (badgesNoPeriodo >= m.PARAMETRO_1) ganhouAgora = true;
                }
                else if (m.TIPO_MARCO === 'TOTAL_PONTOS') {
                    if (currentPoints >= m.PARAMETRO_1) ganhouAgora = true;
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
                    await MarcoConsultor.create({
                        ID_CONSULTOR: consultor.ID_CONSULTOR,
                        ID_MARCO: m.ID_MARCO,
                        DATA_CONQUISTA: new Date()
                    });
                    currentPoints += m.PONTOS_EXTRA;
                    requiresUpdate = true;
                    await HistoricoPontuacao.create({
                        ID_UTILIZADOR: idUtilizador,
                        DATA_ATRIBUICAO: new Date(),
                        PONTOS_OBTIDOS: m.PONTOS_EXTRA || 0,
                        ORIGEM_PONTOS: `Badge premium: ${m.TITULO_MARCO}`
                    });
                    item.data = new Date().toLocaleDateString('pt-PT');
                    await LogAtividadeSistema.create({ ID_UTILIZADOR: idUtilizador, TIPO_ATIVIDADE: 'Badge Premium Obtido', DETALHES_ATIVIDADE: `Ganhou automaticamente o badge premium ${m.TITULO_MARCO}`, DATA_HORA_ATIVIDADE: new Date() });
                    pushService.sendPush(idUtilizador, 'success', 'Novo Badge Premium Obtido', `Parabéns! Ganhou o badge premium "${m.TITULO_MARCO}".`, 'badges', 'Consultor');
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
        res.status(500).json({ success: false, message: error.message });
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

        if (!conquistaGanha) {
            if (marco.TIPO_MARCO === 'TOTAL_BADGES') {
                const totalBadges = await ConsultorBadge.count({ where: { ID_CONSULTOR: consultor.ID_CONSULTOR }});
                progValor = Math.min((totalBadges / marco.PARAMETRO_1) * 100, 100);
                progTexto = `${totalBadges} / ${marco.PARAMETRO_1} Badges`;
            } 
            else if (marco.TIPO_MARCO === 'BADGES_DIAS') {
                const diasAlvo = marco.PARAMETRO_2;
                const dataLimite = new Date();
                dataLimite.setDate(dataLimite.getDate() - diasAlvo);
                
                const badgesNoPeriodo = await ConsultorBadge.count({
                    where: {
                        ID_CONSULTOR: consultor.ID_CONSULTOR,
                        DATA_ATRIBUICAO_BADGE: { [Op.gte]: dataLimite }
                    }
                });
                progValor = Math.min((badgesNoPeriodo / marco.PARAMETRO_1) * 100, 100);
                progTexto = `${badgesNoPeriodo} / ${marco.PARAMETRO_1} Badges nos últimos ${diasAlvo} dias`;
            }
            else if (marco.TIPO_MARCO === 'MELHOR_ANO' || marco.TIPO_MARCO === 'MELHOR_MESES') {
                const totalConsultores = await Consultor.count();
                const p = consultor.PONTUACAO_TOTAL || 0;
                const consultoresAbaixo = await Consultor.count({
                    where: { PONTUACAO_TOTAL: { [Op.lt]: p } }
                });
                
                progValor = totalConsultores > 1 ? (consultoresAbaixo / (totalConsultores - 1)) * 100 : 100;
                // Exemplo: se tem 10 consultores e 9 estão abaixo, progValor = 100%. (Top 1)
                progTexto = `À frente de ${Math.round(progValor)}% dos consultores`;
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
                obtida: !!conquistaGanha,
                data: conquistaGanha ? new Date(conquistaGanha.DATA_CONQUISTA).toLocaleDateString('pt-PT') : null,
                progressoValor: Math.round(progValor),
                progressoLabel: progTexto
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
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
        res.status(500).json({ success: false, message: error.message });
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
        res.status(500).json({ success: false, message: error.message });
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
        res.status(500).json({ success: false, message: error.message });
    }
};

module.exports = controllers;
