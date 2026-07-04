const Consultor = require('../models/Consultor');
const ConsultorBadge = require('../models/ConsultorBadge');
const Badge = require('../models/Badge');
const Requisito = require('../models/Requisito');
const Utilizador = require('../models/Utilizador');
const Pedido = require('../models/Pedido');
const Evidencia = require('../models/Evidencia');
const MarcoConquista = require('../models/MarcoConquista');
const MarcoConsultor = require('../models/MarcoConsultor');
const { Op } = require('sequelize');
const PDFDocument = require('pdfkit');
const SVGtoPDF = require('svg-to-pdfkit');
const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');
const Nivel = require('../models/Nivel');

const fetchImage = (url) => {
    return new Promise((resolve, reject) => {
        if (!url || typeof url !== 'string' || !url.startsWith('http')) return reject('Invalid URL');
        const client = url.startsWith('https') ? https : http;
        const options = { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36' } };
        client.get(url, options, (res) => {
            if (res.statusCode !== 200) {
                // If it's a redirect, we could handle it, but for now just reject
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

const escaparHtml = (valor) => String(valor ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');

const obterOrigemApi = (req) => (
    process.env.PUBLIC_API_URL
    || process.env.BACKEND_URL
    || `${req.protocol}://${req.get('host')}`
).replace(/\/$/, '');

const obterImagemPublica = (req, imagem) => {
    const origemApi = obterOrigemApi(req);
    const valor = String(imagem || '').trim();
    if (!valor || valor.startsWith('data:') || valor.includes('placeholder') || valor.toLowerCase().endsWith('.svg')) {
        return `${origemApi}/uploads/default-trophy.png`;
    }
    if (/^https?:\/\/localhost:3000/i.test(valor)) {
        return valor.replace(/^https?:\/\/localhost:3000/i, origemApi);
    }
    if (/^https?:\/\//i.test(valor)) return valor;
    if (valor.startsWith('/')) return `${origemApi}${valor}`;
    return `${origemApi}/uploads/${valor.replace(/^uploads\//, '')}`;
};

const enviarPaginaPartilha = (req, res, { titulo, descricao, imagem, destino }) => {
    const urlPartilha = `${obterOrigemApi(req)}${req.originalUrl}`;
    res.set('Content-Type', 'text/html; charset=utf-8');
    res.set('Cache-Control', 'public, max-age=300');
    res.send(`<!doctype html>
<html lang="pt">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escaparHtml(titulo)}</title>
  <meta name="description" content="${escaparHtml(descricao)}">
  <meta property="og:type" content="website">
  <meta property="og:site_name" content="Plataforma de Badges Softinsa">
  <meta property="og:title" content="${escaparHtml(titulo)}">
  <meta property="og:description" content="${escaparHtml(descricao)}">
  <meta property="og:image" content="${escaparHtml(imagem)}">
  <meta property="og:url" content="${escaparHtml(urlPartilha)}">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${escaparHtml(titulo)}">
  <meta name="twitter:description" content="${escaparHtml(descricao)}">
  <meta name="twitter:image" content="${escaparHtml(imagem)}">
  <meta http-equiv="refresh" content="0;url=${escaparHtml(destino)}">
</head>
<body>
  <p>A abrir a verificação oficial do badge Softinsa…</p>
  <p><a href="${escaparHtml(destino)}">Continuar para a página de verificação</a></p>
</body>
</html>`);
};

// 1. Obter todos os badges de um Consultor
controllers.getMeusBadges = async (req, res) => {
    try {
        const { idUtilizador } = req.params;

        const consultor = await Consultor.findOne({ 
            where: { ID_UTILIZADOR: idUtilizador },
            include: [{ model: Utilizador }] 
        });
        if (!consultor) return res.status(404).json({ success: false, message: "Consultor não encontrado." });

        const consultorSL = consultor.Utilizador.SL_REGISTO || 'Geral';

        const meusBadgesBD = await ConsultorBadge.findAll({
            where: {
                ID_CONSULTOR: consultor.ID_CONSULTOR,
                [Op.or]: [
                    { DATA_EXPIRACAO: null },
                    { DATA_EXPIRACAO: { [Op.gt]: new Date() } }
                ]
            },
            include: [{ 
                model: Badge,
                include: [
                    { model: Requisito, as: 'requisitos' },
                    { model: Nivel }
                ]
            }]
        });

        const badgesFormatados = meusBadgesBD.map(cb => {
            const badge = cb.Badge;
            const hoje = new Date();
            const dataExpiracao = cb.DATA_EXPIRACAO ? new Date(cb.DATA_EXPIRACAO) : null;
            let diasRestantes = null;
            
            if (dataExpiracao) {
                diasRestantes = Math.ceil((dataExpiracao - hoje) / (1000 * 60 * 60 * 24));
            }

            let catObj = { serviceLine: badge.CATEGORIA_BADGE, area: badge.CATEGORIA_BADGE };
            try {
                if (badge.CATEGORIA_BADGE && badge.CATEGORIA_BADGE.startsWith('{')) {
                    catObj = JSON.parse(badge.CATEGORIA_BADGE);
                }
            } catch(e) {}
            
            let slParsed = catObj.serviceLine || 'Geral';
            let areaParsed = catObj.area || 'Geral';

            const levelLetter = badge.Nivel?.ORDEM_HIERARQUICA
                ? String.fromCharCode(64 + badge.Nivel.ORDEM_HIERARQUICA)
                : (badge.Nivel?.NOME_NIVEL || 'N/A');

            return {
                id: badge.ID_BADGE,
                titulo: badge.NOME_BADGE,
                serviceLine: slParsed,
                area: areaParsed,
                nivel: levelLetter,
                urlImagem: badge.URL_IMAGEM || '',
                validade: new Date(cb.DATA_ATRIBUICAO_BADGE).toLocaleDateString('pt-PT'),
                diasRestantes: diasRestantes,
                status: (diasRestantes !== null && diasRestantes < 0) ? 'Inativo' : 'Ativo',
                corStatus: (diasRestantes !== null && diasRestantes < 0) ? 'danger' : 'success',
                requisitos: `${badge.requisitos.length} requisitos`,
                pontos: badge.PONTOS_BADGE,
                linkPublico: cb.LINK_UNICO_BADGE
            };
        });

        res.json({ success: true, data: badgesFormatados, userSl: consultorSL });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// 2. Detalhes individuais de um Badge Obtido
controllers.getDetalhesBadgeObtido = async (req, res) => {
    try {
        const { idUtilizador, idBadge } = req.params;

        const consultor = await Consultor.findOne({ where: { ID_UTILIZADOR: idUtilizador } });
        if (!consultor) return res.status(404).json({ success: false, message: "Consultor não encontrado." });

        const cb = await ConsultorBadge.findOne({
            where: {
                ID_CONSULTOR: consultor.ID_CONSULTOR,
                ID_BADGE: idBadge,
                [Op.or]: [
                    { DATA_EXPIRACAO: null },
                    { DATA_EXPIRACAO: { [Op.gt]: new Date() } }
                ]
            },
            include: [{
                model: Badge,
                include: [
                    { model: Requisito, as: 'requisitos' },
                    { model: Nivel }
                ]
            }]
        });

        if (!cb) return res.status(404).json({ success: false, message: "Badge não encontrado." });

        const badge = cb.Badge;
        const hoje = new Date();
        const dataExpiracao = cb.DATA_EXPIRACAO ? new Date(cb.DATA_EXPIRACAO) : null;
        let diasRestantes = null;
        if(dataExpiracao) diasRestantes = Math.ceil((dataExpiracao - hoje) / (1000 * 60 * 60 * 24));
        
        const status = (diasRestantes !== null && diasRestantes < 0) ? 'Inativo' : 'Ativo';

        let slParsed = 'Global';
        let areaParsed = 'Global';
        try {
            const catObj = JSON.parse(badge.CATEGORIA_BADGE);
            if (catObj.serviceLine) slParsed = catObj.serviceLine;
            if (catObj.area) areaParsed = catObj.area;
        } catch(e) {}

        const levelLetter = badge.Nivel?.ORDEM_HIERARQUICA
            ? String.fromCharCode(64 + badge.Nivel.ORDEM_HIERARQUICA)
            : (badge.Nivel?.NOME_NIVEL || 'N/A');
        const formatarValidade = (totalMeses) => {
            if (!totalMeses) return 'Sem limite';
            const anos = Math.floor(totalMeses / 12);
            const meses = totalMeses % 12;
            const partes = [];
            if (anos > 0) partes.push(`${anos} ano${anos > 1 ? 's' : ''}`);
            if (meses > 0) partes.push(`${meses} ${meses === 1 ? 'mês' : 'meses'}`);
            return partes.join(' e ');
        };

        // Procurar ficheiros submetidos no Pedido correspondente
        const pedidoAceite = await Pedido.findOne({
            where: { ID_UTILIZADOR: idUtilizador, ID_BADGE: idBadge, ESTADO_PEDIDO: 'Aceite' },
            order: [['DATA_SUBMISSAO_PEDIDO', 'DESC']],
            include: [{ model: Evidencia }]
        });
        
        let ficheirosEvidencia = [];
        if (pedidoAceite && pedidoAceite.Evidencia) {
            ficheirosEvidencia = pedidoAceite.Evidencia.map(e => ({
                idRequisito: e.ID_REQUISITO,
                nome: e.NOME_FICHEIRO,
                url: e.URL_FICHEIRO
            }));
        }

        res.json({ 
            success: true, 
            data: {
                id: badge.ID_BADGE,
                linkUnico: cb.LINK_UNICO_BADGE,
                titulo: badge.NOME_BADGE,
                serviceLine: slParsed,
                area: areaParsed,
                nivel: levelLetter,
                urlImagem: badge.URL_IMAGEM || '',
                status: status,
                renovavel: diasRestantes !== null && diasRestantes <= 30,
                expiraEm: diasRestantes !== null ? (diasRestantes < 0 ? `Expirou há ${Math.abs(diasRestantes)} dias` : `Expira em ${diasRestantes} dias`) : 'Não expira',
                dataExpira: cb.DATA_EXPIRACAO ? new Date(cb.DATA_EXPIRACAO).toLocaleDateString('pt-PT') : 'N/A',
                dataValidado: new Date(cb.DATA_ATRIBUICAO_BADGE).toLocaleDateString('pt-PT'),
                validade: badge.VALIDADE_EXPIRACAO
                    ? `Até ${new Date(badge.VALIDADE_EXPIRACAO).toLocaleDateString('pt-PT')}`
                    : formatarValidade(badge.VALIDADE_MESES),
                pontos: badge.PONTOS_BADGE,
                descricao: badge.DESCRICAO_BADGE,
                requisitos: badge.requisitos.map(r => ({ idBd: r.ID_REQUISITO, id: `REQ-${r.ID_REQUISITO}`, desc: r.TITULO_REQUISITO })),
                ficheiros: ficheirosEvidencia,
                nomeConsultor: consultor.Utilizador ? consultor.Utilizador.NOME_COMPLETO_UTILIZADOR : 'Consultor'
            } 
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// 3. Verificação Pública (Via Link Único)
controllers.getVerificacaoPublica = async (req, res) => {
    try {
        const { linkUnico } = req.params;
        const cb = await ConsultorBadge.findOne({
            where: {
                LINK_UNICO_BADGE: linkUnico,
                [Op.or]: [
                    { DATA_EXPIRACAO: null },
                    { DATA_EXPIRACAO: { [Op.gt]: new Date() } }
                ]
            },
            include: [
                {
                    model: Badge,
                    include: [
                        { model: Requisito, as: 'requisitos' },
                        { model: Nivel }
                    ]
                },
                { model: Consultor, include: [{ model: Utilizador }] }
            ]
        });

        if (!cb) return res.status(404).json({ success: false, message: "Link de verificação inválido." });

        const consultor = cb.Consultor;
        const util = consultor.Utilizador;
        const badge = cb.Badge;

        let slParsed = 'Global';
        let areaParsed = 'Global';
        try {
            const catObj = JSON.parse(badge.CATEGORIA_BADGE);
            if (catObj.serviceLine) slParsed = catObj.serviceLine;
            if (catObj.area) areaParsed = catObj.area;
        } catch(e) {}

        const levelLetter = badge.Nivel?.ORDEM_HIERARQUICA
            ? String.fromCharCode(64 + badge.Nivel.ORDEM_HIERARQUICA)
            : (badge.Nivel?.NOME_NIVEL || 'N/A');

        const { getConsultorStats } = require('../utils/pontosHelper');
        const statsConsultor = await getConsultorStats(consultor.ID_CONSULTOR);

        res.json({ 
            success: true, 
            data: {
                consultor: {
                    idUtilizador: util.ID_UTILIZADOR,
                    nome: util.NOME_COMPLETO_UTILIZADOR,
                    cargo: `Consultor - Área de ${util.AREA_REGISTO || 'Geral'}`,
                    serviceLine: `${util.SL_REGISTO || 'Geral'} Service Line`,
                    urlFoto: util.URL_FOTO,
                    totalBadges: statsConsultor.badgesTotais,
                    pontosTotais: statsConsultor.pontosTotais,
                    ranking: statsConsultor.ranking,
                    totalConsultores: statsConsultor.totalConsultores
                },
                badge: {
                    codigo: `SFT-${slParsed.substring(0,3).toUpperCase()}-00${badge.ID_BADGE}`,
                    titulo: badge.NOME_BADGE,
                    serviceLine: slParsed,
                    area: areaParsed,
                    nivel: levelLetter,
                    urlImagem: badge.URL_IMAGEM || '',
                    dataEmissao: new Date(cb.DATA_ATRIBUICAO_BADGE).toLocaleDateString('pt-PT'),
                    dataExpiracao: cb.DATA_EXPIRACAO ? new Date(cb.DATA_EXPIRACAO).toLocaleDateString('pt-PT') : 'N/A',
                    requisitos: badge.requisitos.map(r => ({
                        id: `REQ-${r.ID_REQUISITO}`,
                        titulo: r.TITULO_REQUISITO,
                        desc: r.DESCRICAO_REQUISITO
                    }))
                }
            } 
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
}

controllers.getPartilhaLinkedInBadge = async (req, res) => {
    try {
        const { linkUnico } = req.params;
        const cb = await ConsultorBadge.findOne({
            where: {
                LINK_UNICO_BADGE: linkUnico,
                STATUS_GALERIA_PUBLICA: true,
                [Op.or]: [
                    { DATA_EXPIRACAO: null },
                    { DATA_EXPIRACAO: { [Op.gt]: new Date() } }
                ]
            },
            include: [
                { model: Badge, include: [{ model: Nivel }] },
                { model: Consultor, include: [{ model: Utilizador }] }
            ]
        });
        if (!cb) {
            return res.status(404).send('Badge público não encontrado ou expirado.');
        }

        const frontendUrl = (process.env.FRONTEND_URL || process.env.PUBLIC_APP_URL || 'http://localhost:5173').replace(/\/$/, '');
        const badge = cb.Badge;
        const consultor = cb.Consultor.Utilizador;

        let slParsed = 'Global';
        let areaParsed = 'Global';
        try {
            const catObj = JSON.parse(badge.CATEGORIA_BADGE);
            if (catObj.serviceLine) slParsed = catObj.serviceLine;
            if (catObj.area) areaParsed = catObj.area;
        } catch(e) {}

        const levelLetter = badge.Nivel?.ORDEM_HIERARQUICA
            ? String.fromCharCode(64 + badge.Nivel.ORDEM_HIERARQUICA)
            : 'N/A';
        const levelName = badge.Nivel?.NOME_NIVEL || 'N/A';
        const nivelStr = `${levelName} (Nível ${levelLetter})`;

        const formatarValidade = (totalMeses) => {
            if (!totalMeses) return 'Sem validade (Vitalício)';
            const anos = Math.floor(totalMeses / 12);
            const meses = totalMeses % 12;
            const partes = [];
            if (anos > 0) partes.push(`${anos} ano${anos > 1 ? 's' : ''}`);
            if (meses > 0) partes.push(`${meses} ${meses === 1 ? 'mês' : 'meses'}`);
            return partes.join(' e ');
        };

        const dataAtribuicao = new Date(cb.DATA_ATRIBUICAO_BADGE).toLocaleDateString('pt-PT');
        const validadeStr = badge.VALIDADE_EXPIRACAO
            ? `Até ${new Date(badge.VALIDADE_EXPIRACAO).toLocaleDateString('pt-PT')}`
            : formatarValidade(badge.VALIDADE_MESES);

        const pontos = badge.PONTOS_BADGE;

        const descricaoCompleta = `${consultor.NOME_COMPLETO_UTILIZADOR} obteve o badge "${badge.NOME_BADGE}" na Plataforma de Badges Softinsa.
• Service Line: ${slParsed}
• Área: ${areaParsed}
• Nível: ${nivelStr}
• Pontos: +${pontos}
• Atribuído a: ${dataAtribuicao}
• Validade: ${validadeStr}

Valide oficialmente esta conquista clicando no link!`;

        return enviarPaginaPartilha(req, res, {
            titulo: `${badge.NOME_BADGE} — Badge Softinsa`,
            descricao: descricaoCompleta,
            imagem: obterImagemPublica(req, badge.URL_IMAGEM),
            destino: `${frontendUrl}/verificacao/${encodeURIComponent(linkUnico)}`
        });
    } catch (error) {
        res.status(500).send('Não foi possível preparar a partilha deste badge.');
    }
};

controllers.getPartilhaLinkedInGaleria = async (req, res) => {
    try {
        const { idUtilizador } = req.params;
        const consultor = await Consultor.findOne({
            where: { ID_UTILIZADOR: idUtilizador },
            include: [{ model: Utilizador }]
        });
        if (!consultor) {
            return res.status(404).send('Galeria pública não encontrada.');
        }

        const badgeDestaque = await ConsultorBadge.findOne({
            where: {
                ID_CONSULTOR: consultor.ID_CONSULTOR,
                STATUS_GALERIA_PUBLICA: true,
                [Op.or]: [
                    { DATA_EXPIRACAO: null },
                    { DATA_EXPIRACAO: { [Op.gt]: new Date() } }
                ]
            },
            include: [{ model: Badge }],
            order: [['DATA_ATRIBUICAO_BADGE', 'DESC']]
        });
        const totalBadges = await ConsultorBadge.count({
            where: {
                ID_CONSULTOR: consultor.ID_CONSULTOR,
                STATUS_GALERIA_PUBLICA: true,
                [Op.or]: [
                    { DATA_EXPIRACAO: null },
                    { DATA_EXPIRACAO: { [Op.gt]: new Date() } }
                ]
            }
        });
        const totalPremium = await MarcoConsultor.count({
            where: { ID_CONSULTOR: consultor.ID_CONSULTOR }
        });

        const frontendUrl = (process.env.FRONTEND_URL || process.env.PUBLIC_APP_URL || 'http://localhost:5173').replace(/\/$/, '');
        const nome = consultor.Utilizador.NOME_COMPLETO_UTILIZADOR;
        const total = totalBadges + totalPremium;
        return enviarPaginaPartilha(req, res, {
            titulo: `Galeria de Badges de ${nome} — Softinsa`,
            descricao: `Consulte os ${total} badges e conquistas profissionais de ${nome} na Plataforma de Badges Softinsa.`,
            imagem: obterImagemPublica(req, badgeDestaque?.Badge?.URL_IMAGEM),
            destino: `${frontendUrl}/galeria/${idUtilizador}`
        });
    } catch (error) {
        res.status(500).send('Não foi possível preparar a partilha desta galeria.');
    }
};

// 4. Galeria Pública de um Consultor
controllers.getGaleriaPublica = async (req, res) => {
    try {
        const { idUtilizador } = req.params;
        
        const util = await Utilizador.findByPk(idUtilizador);
        if(!util) return res.status(404).json({success: false, message: "Utilizador não encontrado"});

        const consultor = await Consultor.findOne({where: {ID_UTILIZADOR: idUtilizador}});
        if(!consultor) return res.status(404).json({success: false, message: "Perfil não disponível"});

        const meusBadges = await ConsultorBadge.findAll({
            where: {
                ID_CONSULTOR: consultor.ID_CONSULTOR,
                STATUS_GALERIA_PUBLICA: true,
                [Op.or]: [
                    { DATA_EXPIRACAO: null },
                    { DATA_EXPIRACAO: { [Op.gt]: new Date() } }
                ]
            },
            include: [{ model: Badge, include: [{ model: Nivel }] }]
        });

        const badgesFormatados = meusBadges.map(cb => {
            const badge = cb.Badge;
            let slParsed = 'Global';
            let areaParsed = 'Global';
            try {
                const catObj = JSON.parse(badge.CATEGORIA_BADGE);
                if (catObj.serviceLine) slParsed = catObj.serviceLine;
                if (catObj.area) areaParsed = catObj.area;
            } catch(e) {}
            
            const levelLetter = badge.Nivel?.ORDEM_HIERARQUICA
                ? String.fromCharCode(64 + badge.Nivel.ORDEM_HIERARQUICA)
                : (badge.Nivel?.NOME_NIVEL || 'N/A');

            return {
                id: badge.ID_BADGE,
                linkUnico: cb.LINK_UNICO_BADGE,
                titulo: badge.NOME_BADGE,
                nivel: `Nível ${levelLetter}`,
                nivelLetra: levelLetter,
                emissao: new Date(cb.DATA_ATRIBUICAO_BADGE).toLocaleDateString('pt-PT'),
                sl: slParsed,
                area: areaParsed,
                urlImagem: badge.URL_IMAGEM || '',
                color: "#5D78FF",
                tipoBadge: "Normal"
            };
        });

        // Procurar Conquistas Especiais obtidas
        const marcosObtidos = await MarcoConsultor.findAll({
            where: { ID_CONSULTOR: consultor.ID_CONSULTOR }
        });
        
        const idsMarcos = marcosObtidos.map(m => m.ID_MARCO);
        const conquistas = await MarcoConquista.findAll({
            where: { ID_MARCO: { [Op.in]: idsMarcos } }
        });

        const conquistasFormatadas = conquistas.map(m => {
            const relacao = marcosObtidos.find(r => r.ID_MARCO == m.ID_MARCO);
            return {
                id: m.ID_MARCO,
                linkUnico: null,
                titulo: m.TITULO_MARCO,
                nivel: "Conquista Especial",
                emissao: new Date(relacao.DATA_CONQUISTA).toLocaleDateString('pt-PT'),
                sl: "Global",
                urlImagem: m.URL_IMAGEM_MARCO || '',
                color: "#D4AF37",
                tipoBadge: "Especial",
                bonus: m.PONTOS_EXTRA,
                tipoMarco: m.TIPO_MARCO || 'Conquista'
            };
        });

        const todosItems = [...badgesFormatados, ...conquistasFormatadas];

        // Adicionar Estatísticas Avançadas
        const { getConsultorStats } = require('../utils/pontosHelper');
        const statsConsultor = await getConsultorStats(consultor.ID_CONSULTOR);
        const ranking = statsConsultor.ranking;
        const totalConsultores = statsConsultor.totalConsultores;
        
        const anoAtual = new Date().getFullYear();
        const badgesAnoNormais = await ConsultorBadge.count({
            where: { ID_CONSULTOR: consultor.ID_CONSULTOR, DATA_ATRIBUICAO_BADGE: { [Op.gte]: new Date(anoAtual, 0, 1) } }
        });
        const badgesAnoEspeciais = await MarcoConsultor.count({
            where: { ID_CONSULTOR: consultor.ID_CONSULTOR, DATA_CONQUISTA: { [Op.gte]: new Date(anoAtual, 0, 1) } }
        });
        const badgesAno = badgesAnoNormais + badgesAnoEspeciais;

        // Adicionar Jornada / Learning Paths
        const pedidosPendentes = await Pedido.findAll({
            where: { 
                ID_UTILIZADOR: idUtilizador, 
                ESTADO_PEDIDO: { [Op.in]: ['Pendente', 'Em Análise SLL', 'Pendente de Correção', 'Rascunho'] } 
            },
            include: [{ model: Badge }]
        });

        const jornada = [];
        for (let p of pedidosPendentes) {
            const totalReq = await Requisito.count({ where: { ID_BADGE: p.ID_BADGE } });
            const evidencias = await Evidencia.findAll({ where: { ID_PEDIDO: p.ID_PEDIDO } });
            const reqComFicheiros = new Set(evidencias.filter(e => e.ID_REQUISITO !== null).map(e => e.ID_REQUISITO)).size;
            
            if (evidencias.length === 0) continue;
            
            let slParsed = 'Global';
            try {
                const catObj = JSON.parse(p.Badge.CATEGORIA_BADGE);
                if (catObj.serviceLine) slParsed = catObj.serviceLine;
            } catch(e) {}

            jornada.push({
                nome: p.Badge.NOME_BADGE,
                serviceLine: slParsed,
                reqSubmetidos: reqComFicheiros,
                reqTotais: totalReq === 0 ? 1 : totalReq
            });
        }

        res.json({ 
            success: true, 
            data: {
                consultor: {
                    idUtilizador: util.ID_UTILIZADOR,
                    nome: util.NOME_COMPLETO_UTILIZADOR,
                    cargo: `Consultor - Área de ${util.AREA_REGISTO || 'Geral'}`,
                    serviceLine: `${util.SL_REGISTO || 'Geral'} Service Line`,
                    urlFoto: util.URL_FOTO,
                    totalBadges: statsConsultor.badgesTotais,
                    totalConquistas: conquistas.length,
                    pontosTotais: statsConsultor.pontosTotais,
                    ranking: ranking,
                    totalConsultores: totalConsultores,
                    badgesAno: badgesAno,
                    jornada: jornada
                },
                badges: todosItems
            } 
        });
    } catch(error) {
         res.status(500).json({ success: false, message: error.message });
    }
}

module.exports = controllers;

// 5. Verificação Pública de Conquista Especial
controllers.getVerificacaoEspecialPublica = async (req, res) => {
    try {
        const { idUtilizador, idMarco } = req.params;

        const util = await Utilizador.findByPk(idUtilizador);
        if(!util) return res.status(404).json({success: false, message: "Utilizador não encontrado"});

        const consultor = await Consultor.findOne({where: {ID_UTILIZADOR: idUtilizador}});
        if(!consultor) return res.status(404).json({success: false, message: "Perfil não disponível"});

        const relacao = await MarcoConsultor.findOne({
            where: { ID_CONSULTOR: consultor.ID_CONSULTOR, ID_MARCO: idMarco }
        });
        if(!relacao) return res.status(404).json({success: false, message: "Conquista não encontrada neste perfil"});

        const marco = await MarcoConquista.findByPk(idMarco);

        const totalBadgesAtivos = await ConsultorBadge.count({
            where: { ID_CONSULTOR: consultor.ID_CONSULTOR, STATUS_GALERIA_PUBLICA: true }
        });

        const { getConsultorStats } = require('../utils/pontosHelper');
        const statsConsultor = await getConsultorStats(consultor.ID_CONSULTOR);
        const ranking = statsConsultor.ranking;
        const totalConsultores = statsConsultor.totalConsultores;

        res.json({
            success: true,
            data: {
                consultor: {
                    idUtilizador: util.ID_UTILIZADOR,
                    nome: util.NOME_COMPLETO_UTILIZADOR,
                    cargo: `Consultor - Área de ${util.AREA_REGISTO || 'Geral'}`,
                    serviceLine: `${util.SL_REGISTO || 'Geral'} Service Line`,
                    urlFoto: util.URL_FOTO,
                    totalBadges: statsConsultor.badgesTotais,
                    pontosTotais: statsConsultor.pontosTotais,
                    ranking: ranking,
                    totalConsultores: totalConsultores
                },
                conquista: {
                    id: marco.ID_MARCO,
                    titulo: marco.TITULO_MARCO,
                    descricao: marco.DESCRICAO_MARCO,
                    tipoMarco: marco.TIPO_MARCO || 'Conquista',
                    urlImagem: marco.URL_IMAGEM_MARCO || '',
                    dataEmissao: new Date(relacao.DATA_CONQUISTA).toLocaleDateString('pt-PT'),
                    pontosExtra: marco.PONTOS_EXTRA
                }
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

controllers.getPartilhaLinkedInEspecial = async (req, res) => {
    try {
        const { idUtilizador, idMarco } = req.params;
        const consultor = await Consultor.findOne({
            where: { ID_UTILIZADOR: idUtilizador },
            include: [{ model: Utilizador }]
        });
        if (!consultor) {
            return res.status(404).send('Consultor não encontrado.');
        }
        const relacao = await MarcoConsultor.findOne({
            where: { ID_CONSULTOR: consultor.ID_CONSULTOR, ID_MARCO: idMarco }
        });
        const marco = await MarcoConquista.findByPk(idMarco);
        if (!relacao || !marco) {
            return res.status(404).send('Badge premium público não encontrado.');
        }

        const frontendUrl = (process.env.FRONTEND_URL || process.env.PUBLIC_APP_URL || 'http://localhost:5173').replace(/\/$/, '');
        
        const dataAtribuicao = new Date(relacao.DATA_CONQUISTA).toLocaleDateString('pt-PT');
        
        const descricaoCompleta = `${consultor.Utilizador.NOME_COMPLETO_UTILIZADOR} alcançou a conquista especial "${marco.TITULO_MARCO}" na Plataforma de Badges Softinsa.
• Categoria: ${marco.TIPO_MARCO || 'Conquista Especial'}
• Pontos Bónus: +${marco.PONTOS_EXTRA}
• Conquistado a: ${dataAtribuicao}

Valide oficialmente esta conquista especial clicando no link!`;

        return enviarPaginaPartilha(req, res, {
            titulo: `${marco.TITULO_MARCO} — Badge Premium Softinsa`,
            descricao: descricaoCompleta,
            imagem: obterImagemPublica(req, marco.URL_IMAGEM_MARCO),
            destino: `${frontendUrl}/verificacao-especial/${idUtilizador}/${idMarco}`
        });
    } catch (error) {
        res.status(500).send('Não foi possível preparar a partilha deste badge premium.');
    }
};

// 5. Download Certificado em PDF
controllers.downloadCertificado = async (req, res) => {
    try {
        const { idUtilizador, idBadge } = req.params;

        const consultor = await Consultor.findOne({ 
            where: { ID_UTILIZADOR: idUtilizador },
            include: [{ model: Utilizador }]
        });
        if (!consultor) return res.status(404).json({ success: false, message: "Consultor não encontrado." });

        const cb = await ConsultorBadge.findOne({
            where: { ID_CONSULTOR: consultor.ID_CONSULTOR, ID_BADGE: idBadge },
            include: [{
                model: Badge,
                include: [
                    { model: Requisito, as: 'requisitos' },
                    { model: Nivel }
                ]
            }]
        });
        if (!cb) return res.status(404).json({ success: false, message: "Badge não encontrado." });

        const doc = new PDFDocument({
            size: 'A4',
            layout: 'landscape',
            margins: { top: 50, bottom: 50, left: 50, right: 50 }
        });

        const ordemNivel = cb.Badge.Nivel?.ORDEM_HIERARQUICA;
        const levelLetter = ordemNivel ? String.fromCharCode(64 + ordemNivel) : 'N/A';
        const levelName = cb.Badge.Nivel?.NOME_NIVEL || 'Nível não definido';

        res.setHeader('Content-disposition', `attachment; filename="Certificado_Softinsa_${cb.Badge.NOME_BADGE.replace(/\s+/g, '_')}-Nivel${levelLetter}.pdf"`);
        res.setHeader('Content-type', 'application/pdf');

        doc.pipe(res);

        // Estilo do PDF
        doc.rect(20, 20, 802, 555).stroke('#084298');
        doc.rect(25, 25, 792, 545).stroke('#5D78FF');

        doc.fontSize(40).fillColor('#084298').text('CERTIFICADO DE COMPETÊNCIA', { align: 'center' });
        doc.moveDown(1);

        doc.fontSize(20).fillColor('#333333').text('Certifica-se que', { align: 'center' });
        doc.moveDown(0.5);

        doc.fontSize(30).fillColor('#084298').text(consultor.Utilizador.NOME_COMPLETO_UTILIZADOR, { align: 'center' });
        doc.moveDown(1);

        doc.fontSize(16).fillColor('#333333').text('Concluiu com sucesso todos os requisitos para a atribuição do badge:', { align: 'center' });
        doc.moveDown(0.5);

        doc.fontSize(25).fillColor('#5D78FF').text(cb.Badge.NOME_BADGE, { align: 'center' });
        doc.moveDown(0.5);

        // IMAGEM AQUI (Entre Nome e Datas)
        try {
            const defaultTrophyUrl = 'default-trophy';
            const imgUrl = cb.Badge.URL_IMAGEM && cb.Badge.URL_IMAGEM.trim() !== '' ? cb.Badge.URL_IMAGEM : defaultTrophyUrl;
            let imgBuffer;
            
            if (imgUrl === defaultTrophyUrl || imgUrl.includes('default-trophy')) {
                const localTrophyPath = path.join(__dirname, '../../uploads/default-trophy.png');
                imgBuffer = fs.readFileSync(localTrophyPath);
            } else if (imgUrl.includes('/uploads/')) {
                imgBuffer = fs.readFileSync(path.join(__dirname, '../../uploads', path.basename(imgUrl)));
            } else if (imgUrl.startsWith('data:image')) {
                const base64Data = imgUrl.replace(/^data:image\/\w+;base64,/, "");
                imgBuffer = Buffer.from(base64Data, 'base64');
            } else {
                imgBuffer = await fetchImage(imgUrl);
            }
            
            const imgSize = 50; // Smaller image to fit in circle
            const imgX = (doc.page.width - imgSize) / 2;
            const imgY = doc.y;
            
            // Desenhar a borda circular azul (maior que a imagem para a conter inteiramente)
            doc.circle(imgX + imgSize/2, imgY + imgSize/2, 35).lineWidth(1.5).stroke('#5D78FF');
            
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
            doc.y += 75; // Less vertical spacing
        } catch(e) {
            console.log("Erro ao carregar imagem para o PDF:", e);
            
            // Fallback para a Imagem Padrão (Troféu)
            const localTrophyPath = path.join(__dirname, '../../uploads/default-trophy.png');
            let fallbackBuffer;
            try {
                fallbackBuffer = fs.readFileSync(localTrophyPath);
            } catch (err) {
                // Extreme fallback se o ficheiro local também falhar
                console.log("Erro no fallback:", err);
            }

            if (fallbackBuffer) {
                const imgSize = 50;
                const imgX = (doc.page.width - imgSize) / 2;
                const imgY = doc.y;
                
                doc.circle(imgX + imgSize/2, imgY + imgSize/2, 35).lineWidth(1.5).stroke('#5D78FF');
                doc.image(fallbackBuffer, imgX, imgY, { width: imgSize, height: imgSize });
                doc.y += 75; 
            } else {
                doc.y += 75;
            }
        }

        const dataEmissao = new Date(cb.DATA_ATRIBUICAO_BADGE).toLocaleDateString('pt-PT');
        doc.fontSize(14).fillColor('#555555').text(`Data de Emissão: ${dataEmissao}`, { align: 'center' });
        doc.text(`Pontuação atribuída: ${cb.Badge.PONTOS_BADGE || 0} pontos`, { align: 'center' });

        if (cb.DATA_EXPIRACAO) {
            const dataExp = new Date(cb.DATA_EXPIRACAO).toLocaleDateString('pt-PT');
            doc.text(`Válido até: ${dataExp}`, { align: 'center' });
        } else {
            doc.text('Validade: Vitalício', { align: 'center' });
        }
        
        doc.moveDown(1);
        

        doc.moveDown(0.5);
        
        let slParsed = 'Geral';
        let areaParsed = 'Geral';
        try {
            const catObj = JSON.parse(cb.Badge.CATEGORIA_BADGE);
            if (catObj.serviceLine) slParsed = catObj.serviceLine;
            if (catObj.area) areaParsed = catObj.area;
        } catch(e) {}
        
        doc.fontSize(12).fillColor('#333').text(`Service Line: ${slParsed}   |   Área: ${areaParsed}   |   Nível: ${levelName} (${levelLetter})`, { align: 'center' });
        doc.moveDown(0.5);
        
        const frontendUrl = (process.env.FRONTEND_URL || process.env.PUBLIC_APP_URL || 'http://localhost:5173').replace(/\/$/, '');
        doc.fontSize(10).fillColor('#999999').text(`Link de Verificação Oficial: ${frontendUrl}/verificacao/${encodeURIComponent(cb.LINK_UNICO_BADGE)}`, { align: 'center' });

        // Segunda página: informação equivalente ao ecrã de detalhes do badge.
        doc.addPage();
        doc.rect(20, 20, 802, 555).stroke('#084298');
        doc.rect(25, 25, 792, 545).stroke('#5D78FF');
        doc.fontSize(28).fillColor('#084298').text('DETALHES DA COMPETÊNCIA CERTIFICADA', { align: 'center' });
        doc.moveDown(1);
        doc.fontSize(18).fillColor('#5D78FF').text(cb.Badge.NOME_BADGE, { align: 'center' });
        doc.moveDown(1);
        doc.fontSize(12).fillColor('#333333')
            .text(`Descrição: ${cb.Badge.DESCRICAO_BADGE || 'Sem descrição adicional.'}`)
            .moveDown(0.8)
            .text(`Service Line: ${slParsed}`)
            .text(`Área: ${areaParsed}`)
            .text(`Nível: ${levelName} (${levelLetter})`)
            .text(`Pontos: ${cb.Badge.PONTOS_BADGE || 0}`)
            .moveDown(1);
        doc.fontSize(16).fillColor('#084298').text('Requisitos certificados');
        doc.moveDown(0.5);
        const requisitos = [...(cb.Badge.requisitos || [])]
            .sort((a, b) => (a.ORDEM_REQUISITO || 0) - (b.ORDEM_REQUISITO || 0));
        if (requisitos.length === 0) {
            doc.fontSize(11).fillColor('#555555').text('Não existem requisitos adicionais registados.');
        } else {
            requisitos.forEach((requisito, index) => {
                doc.fontSize(11).fillColor('#333333').text(
                    `${index + 1}. ${requisito.TITULO_REQUISITO} — ${requisito.DESCRICAO_REQUISITO || 'Sem descrição.'}`,
                    { indent: 10 }
                );
                doc.moveDown(0.35);
            });
        }

        doc.end();

    } catch (error) {
        console.error("Erro PDF:", error);
        res.status(500).json({ success: false, message: error.message });
    }
};
