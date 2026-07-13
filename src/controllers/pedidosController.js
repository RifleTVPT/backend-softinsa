
const Pedido = require('../models/Pedido');
const sequelize = require('../config/database');
const HistoricoPedido = require('../models/HistoricoPedido');
const Evidencia = require('../models/Evidencia');
const Badge = require('../models/Badge');
const Utilizador = require('../models/Utilizador');
const Nivel = require('../models/Nivel');
const Consultor = require('../models/Consultor');
const ConsultorBadge = require('../models/ConsultorBadge');
const LogAtividadeSistema = require('../models/LogAtividadeSistema');
const Requisito = require('../models/Requisito');
const RegistoHistoricoPedido = require('../models/RegistoHistoricoPedido');
const { Op } = require('sequelize');
const { obterServiceLineSLL: resolverServiceLineSLL } = require('../utils/sllServiceLineHelper');
const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');
const mailer = require('../config/mailer');
const HistoricoPontuacao = require('../models/HistoricoPontuacao');
const { avaliarConquistasConsultor } = require('../services/conquistaService');
const { getApiOrigin } = require('../services/cloudFileService');
const pushService = require('../services/pushService');

const controllers = {};

const ESTADOS_PEDIDO_EM_CURSO = ['Pendente', 'Em Análise TM', 'Em Análise SLL', 'Pendente de Correção'];

const limparPedidosAtivosDuplicados = async () => {
    const estados = `'Rascunho', 'Pendente', 'Em Análise TM', 'Em Análise SLL', 'Pendente de Correção'`;
    await sequelize.query(`
        UPDATE "PEDIDO"
        SET "ESTADO_PEDIDO" = 'Eliminado',
            "DATA_ULTIMA_ATUALIZACAO" = NOW()
        WHERE "ID_PEDIDO" IN (
            SELECT "ID_PEDIDO"
            FROM (
                SELECT
                    "ID_PEDIDO",
                    ROW_NUMBER() OVER (
                        PARTITION BY "ID_UTILIZADOR", "ID_BADGE"
                        ORDER BY
                            CASE "ESTADO_PEDIDO"
                                WHEN 'Em Análise SLL' THEN 5
                                WHEN 'Em Análise TM' THEN 4
                                WHEN 'Pendente' THEN 4
                                WHEN 'Pendente de Correção' THEN 3
                                WHEN 'Rascunho' THEN 2
                                ELSE 1
                            END DESC,
                            "ID_PEDIDO" DESC
                    ) AS rn
                FROM "PEDIDO"
                WHERE "ESTADO_PEDIDO" IN (${estados})
            ) duplicados
            WHERE rn > 1
          )
    `);
};

const fecharPedidosConcorrentesDoBadge = async ({ idPedidoAceite, idUtilizador, idBadge, transaction = null }) => {
    await Pedido.update(
        {
            ESTADO_PEDIDO: 'Eliminado',
            DATA_ULTIMA_ATUALIZACAO: new Date()
        },
        {
            where: {
                ID_PEDIDO: { [Op.ne]: idPedidoAceite },
                ID_UTILIZADOR: idUtilizador,
                ID_BADGE: idBadge,
                ESTADO_PEDIDO: { [Op.in]: ESTADOS_PEDIDO_EM_CURSO }
            },
            transaction
        }
    );
};

const normalizarStatusAdmin = (estado) => {
    if (['Pendente', 'Em Análise TM', 'Em Análise SLL'].includes(estado)) return 'Em Validação';
    if (['Pendente de Correção', 'Rascunho'].includes(estado)) return 'Rascunho';
    return estado;
};

const calcularNovaDataExpiracao = (badge, dataAtualBase = null) => {
    if (!badge.VALIDADE_MESES && !badge.TEMPO_EXPIRACAO_BADGE) return null;
    
    const hoje = new Date();
    let base = dataAtualBase ? new Date(dataAtualBase) : new Date();
    if (base < hoje) base = new Date();

    if (badge.TEMPO_EXPIRACAO_BADGE) {
        base.setDate(base.getDate() + badge.TEMPO_EXPIRACAO_BADGE);
        return base;
    } else if (badge.VALIDADE_MESES) {
        base.setMonth(base.getMonth() + badge.VALIDADE_MESES);
        return base;
    }
    return null;
};
const obterHistoricoDoPedido = async (idPedido) => {
    const relacoes = await RegistoHistoricoPedido.findAll({ where: { ID_PEDIDO: idPedido } });
    const ids = relacoes.map(relacao => relacao.ID_HISTORICO);
    if (ids.length === 0) return [];
    return HistoricoPedido.findAll({
        where: { ID_HISTORICO: { [Op.in]: ids } },
        include: [Utilizador],
        order: [['DATA_REGISTO_PEDIDO', 'ASC']]
    });
};

const registarHistoricoPedido = async ({ idPedido, idUtilizador, estado, acao, comentario, perfil, resultado }) => {
    const historico = await HistoricoPedido.create({
        ID_UTILIZADOR: idUtilizador,
        DATA_REGISTO_PEDIDO: new Date(),
        ESTADO_ATUAL_PEDIDO: estado,
        TIPO_ACAO: acao,
        COMENTARIO_VALIDADOR: comentario || null,
        PERFIL_DECISOR: perfil,
        STATUS_RESULTADO: resultado
    });
    await RegistoHistoricoPedido.create({ ID_PEDIDO: idPedido, ID_HISTORICO: historico.ID_HISTORICO });
    return historico;
};

const descricaoDecisaoHistorico = historico => {
    if (!historico) return '';
    const comentario = String(historico.COMENTARIO_VALIDADOR || '').trim();
    if (comentario) return comentario;

    const avaliador = historico.Utilizador?.NOME_COMPLETO_UTILIZADOR || 'Avaliador';
    const perfil = historico.PERFIL_DECISOR || 'Avaliador';
    const estado = historico.ESTADO_ATUAL_PEDIDO;
    if (estado === 'Recusado') return `Candidatura rejeitada por ${avaliador} (${perfil}).`;
    if (estado === 'Rascunho') return `Candidatura enviada de volta para correção por ${avaliador} (${perfil}).`;
    if (estado === 'Em Análise SLL') return `Candidatura validada por ${avaliador} (${perfil}) e enviada para validação final do SLL.`;
    if (estado === 'Aceite') return `Candidatura aceite por ${avaliador} (${perfil}).`;
    return `${historico.TIPO_ACAO || 'Estado atualizado'} por ${avaliador} (${perfil}).`;
};

const obterServiceLineSLL = async (req) => {
    return resolverServiceLineSLL(req.userId, req.query.sl);
};

const badgePertenceServiceLine = (badge, serviceLine) => {
    if (!badge?.CATEGORIA_BADGE || !serviceLine) return false;
    try {
        const categoria = JSON.parse(badge.CATEGORIA_BADGE);
        return categoria.serviceLine === serviceLine;
    } catch (e) {
        return badge.CATEGORIA_BADGE === serviceLine;
    }
};

const resolverUrlGuardadoEvidencia = evidencia => {
    const urlGuardado = evidencia.URL_FICHEIRO;
    if (urlGuardado && !urlGuardado.includes('/uploads/simulacao/')) return urlGuardado;

    const nomeSeguro = path.basename(evidencia.NOME_FICHEIRO || '');
    if (!nomeSeguro) return null;
    const pastaUploads = path.join(__dirname, '../../uploads');
    try {
        const candidatos = fs.readdirSync(pastaUploads)
            .filter(nome => nome === nomeSeguro || nome.endsWith(`-${nomeSeguro}`))
            .map(nome => ({
                nome,
                alteradoEm: fs.statSync(path.join(pastaUploads, nome)).mtimeMs
            }))
            .sort((a, b) => b.alteradoEm - a.alteradoEm);
        // Só recupera automaticamente quando a correspondência é inequívoca,
        // evitando abrir um ficheiro homónimo pertencente a outro pedido.
        return candidatos.length === 1 ? `/uploads/${candidatos[0].nome}` : null;
    } catch (_) {
        return null;
    }
};

const resolverUrlPublicaEvidencia = (req, evidencia) => {
    const urlGuardado = resolverUrlGuardadoEvidencia(evidencia);
    if (!urlGuardado) return null;
    const nome = encodeURIComponent(path.basename(evidencia.NOME_FICHEIRO || 'ficheiro'));
    return `${getApiOrigin(req)}/ficheiros/evidencias/${evidencia.ID_EVIDENCIA}/${nome}`;
};

const inferirMimeEvidencia = (nome = '') => {
    const ext = path.extname(String(nome)).toLowerCase();
    const mimes = {
        '.pdf': 'application/pdf',
        '.txt': 'text/plain; charset=utf-8',
        '.csv': 'text/csv; charset=utf-8',
        '.json': 'application/json; charset=utf-8',
        '.png': 'image/png',
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.webp': 'image/webp',
        '.gif': 'image/gif',
        '.svg': 'image/svg+xml; charset=utf-8',
        '.doc': 'application/msword',
        '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        '.xls': 'application/vnd.ms-excel',
        '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        '.ppt': 'application/vnd.ms-powerpoint',
        '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation'
    };
    return mimes[ext] || 'application/octet-stream';
};

const nomeDownloadSeguro = nome => {
    const original = path.basename(String(nome || 'evidencia'));
    const ascii = original.replace(/[^\x20-\x7E]/g, '_').replace(/["\\]/g, '_') || 'evidencia';
    return { original, ascii };
};

const obterBufferRemoto = url => new Promise((resolve, reject) => {
    const cliente = url.startsWith('https:') ? https : http;
    cliente.get(url, response => {
        if ([301, 302, 303, 307, 308].includes(response.statusCode) && response.headers.location) {
            response.resume();
            const destino = new URL(response.headers.location, url).toString();
            return resolve(obterBufferRemoto(destino));
        }
        if (response.statusCode < 200 || response.statusCode >= 300) {
            response.resume();
            return reject(new Error(`Falha ao obter ficheiro (${response.statusCode}).`));
        }
        const chunks = [];
        response.on('data', chunk => chunks.push(chunk));
        response.on('end', () => resolve(Buffer.concat(chunks)));
    }).on('error', reject);
});

const obterBufferEvidencia = async (req, evidencia) => {
    const url = resolverUrlGuardadoEvidencia(evidencia);
    if (!url) return null;

    if (/^https?:\/\//i.test(url)) {
        return obterBufferRemoto(url);
    }

    const caminhoLocal = url.startsWith('/uploads/')
        ? path.join(__dirname, '../../uploads', path.basename(url))
        : path.resolve(__dirname, '../../uploads', path.basename(url));
    if (!fs.existsSync(caminhoLocal)) return null;
    return fs.promises.readFile(caminhoLocal);
};

const extrairEnvelopeEvidencia = buffer => {
    const marcador = 'SOFTINSA_FILE_V1\n';
    if (!buffer || buffer.length < marcador.length) return null;
    const inicio = buffer.subarray(0, marcador.length).toString('utf8');
    if (inicio !== marcador) return null;

    try {
        const payload = JSON.parse(buffer.subarray(marcador.length).toString('utf8'));
        if (!payload?.data) return null;
        return {
            buffer: Buffer.from(payload.data, 'base64'),
            originalname: payload.originalname || 'ficheiro',
            mimetype: payload.mimetype || 'application/octet-stream'
        };
    } catch (error) {
        console.error('Envelope de evidência inválido:', error);
        return null;
    }
};

controllers.servirFicheiroEvidencia = async (req, res) => {
    try {
        const evidencia = await Evidencia.findByPk(req.params.idEvidencia);
        if (!evidencia) return res.status(404).send('Ficheiro não encontrado.');

        let buffer = await obterBufferEvidencia(req, evidencia);
        if (!buffer) return res.status(404).send('Ficheiro indisponível.');

        const envelope = extrairEnvelopeEvidencia(buffer);
        const nomeOriginal = envelope?.originalname || evidencia.NOME_FICHEIRO;
        const mime = envelope?.mimetype || inferirMimeEvidencia(nomeOriginal);
        if (envelope) buffer = envelope.buffer;

        const nome = nomeDownloadSeguro(nomeOriginal);
        const disposition = req.query.download === '1' ? 'attachment' : 'inline';

        res.setHeader('Content-Type', mime);
        res.setHeader('Content-Length', buffer.length);
        res.setHeader('Cache-Control', 'public, max-age=300');
        res.setHeader(
            'Content-Disposition',
            `${disposition}; filename="${nome.ascii}"; filename*=UTF-8''${encodeURIComponent(nome.original)}`
        );
        return res.end(buffer);
    } catch (error) {
        console.error('Erro ao servir evidência:', error);
        return res.status(500).send('Erro ao abrir ficheiro.');
    }
};

const formatarEvidencias = (req, evidencias, requisitosBadge = [], nivelLetra = '') => {
    const requisitosOrdenados = requisitosBadge.slice().sort((a, b) =>
        (a.ORDEM_REQUISITO ?? a.ID_REQUISITO) - (b.ORDEM_REQUISITO ?? b.ID_REQUISITO)
    );
    const indicePorRequisito = new Map(
        requisitosOrdenados.map((requisito, index) => [requisito.ID_REQUISITO, index])
    );

    return evidencias
    .slice()
    .sort((a, b) => {
        const ordemA = a.ID_REQUISITO
            ? (a.Requisito?.ORDEM_REQUISITO ?? a.ID_REQUISITO)
            : Number.MAX_SAFE_INTEGER;
        const ordemB = b.ID_REQUISITO
            ? (b.Requisito?.ORDEM_REQUISITO ?? b.ID_REQUISITO)
            : Number.MAX_SAFE_INTEGER;
        return ordemA - ordemB || a.ID_EVIDENCIA - b.ID_EVIDENCIA;
    })
    .map(e => {
        const url = resolverUrlPublicaEvidencia(req, e);
        const tituloGuardado = e.Requisito?.TITULO_REQUISITO;
        const indice = indicePorRequisito.get(e.ID_REQUISITO);
        const tituloApresentacao = tituloGuardado && !/^Requisito \d+$/i.test(tituloGuardado)
            ? tituloGuardado
            : (e.ID_REQUISITO && indice !== undefined && nivelLetra
                ? `Requisito ${nivelLetra}${indice + 1}`
                : (e.ID_REQUISITO ? 'Requisito' : 'Não mapeado'));
        return {
            Requisito: e.Requisito ? {
                ...(typeof e.Requisito.toJSON === 'function' ? e.Requisito.toJSON() : e.Requisito),
                TITULO_REQUISITO: tituloApresentacao
            } : null,
            ID_REQUISITO: e.ID_REQUISITO,
            REQUISITO_MAPEADO: e.REQUISITO_MAPEADO,
            URL_FICHEIRO: url,
            NOME_FICHEIRO: e.NOME_FICHEIRO,
            req: tituloApresentacao,
            codigoReq: e.REQUISITO_MAPEADO || null,
            descricaoReq: e.Requisito?.DESCRICAO_REQUISITO || '',
            ficheiro: e.NOME_FICHEIRO || 'Documento',
            doc: e.NOME_FICHEIRO || 'Documento',
            url,
            disponivel: Boolean(url)
        };
    });
};


controllers.getHistoricoConsultor = async (req, res) => {
    try {
        await limparPedidosAtivosDuplicados();
        const { idUtilizador } = req.params;
        const pedidos = await Pedido.findAll({
            where: { ID_UTILIZADOR: idUtilizador },
            include: [{ model: Badge, include: [Nivel] }],
            order: [['DATA_ULTIMA_ATUALIZACAO', 'DESC']]
        });

        const dadosFormatados = await Promise.all(pedidos.map(async pedido => {
            let categoria = {
                serviceLine: pedido.Badge?.CATEGORIA_BADGE || 'Geral',
                area: pedido.Badge?.CATEGORIA_BADGE || 'Geral'
            };
            try {
                if (pedido.Badge?.CATEGORIA_BADGE?.startsWith('{')) {
                    categoria = { ...categoria, ...JSON.parse(pedido.Badge.CATEGORIA_BADGE) };
                }
            } catch (e) {}

            const historicos = await obterHistoricoDoPedido(pedido.ID_PEDIDO);
            const ultimoHistorico = historicos.at(-1);
            const estadoMap = {
                'Rascunho': 'Em Preenchimento',
                'Pendente': 'Análise Talent',
                'Em Análise TM': 'Análise Talent',
                'Em Análise SLL': 'Análise SLL',
                'Pendente de Correção': 'Pendente Correção'
            };
            const estado = estadoMap[pedido.ESTADO_PEDIDO] || pedido.ESTADO_PEDIDO;
            const corMap = {
                'Em Preenchimento': 'secondary',
                'Análise Talent': 'warning',
                'Análise SLL': 'info',
                'Pendente Correção': 'primary',
                'Aceite': 'success',
                'Recusado': 'danger',
                'Eliminado': 'dark'
            };

            return {
                id: pedido.ID_PEDIDO,
                badge: pedido.Badge?.NOME_BADGE || 'Badge',
                area: categoria.area || 'Geral',
                serviceLine: categoria.serviceLine || 'Geral',
                nivel: pedido.Badge?.Nivel
                    ? String.fromCharCode(64 + pedido.Badge.Nivel.ORDEM_HIERARQUICA)
                    : 'A',
                dataSub: new Date(pedido.DATA_SUBMISSAO_PEDIDO).toLocaleDateString('pt-PT'),
                status: estado,
                corStatus: corMap[estado] || 'secondary',
                dataAcao: new Date(pedido.DATA_ULTIMA_ATUALIZACAO).toLocaleDateString('pt-PT'),
                feedback: ultimoHistorico?.COMENTARIO_VALIDADOR || ''
            };
        }));

        res.json({ success: true, data: dadosFormatados });
    } catch (e) {
        res.status(500).json({ success: false, message: e.message });
    }
};

controllers.getDetalhesPedido = async (req, res) => {
    try {
        const { idPedido } = req.params;
        const pedido = await Pedido.findByPk(idPedido, {
            include: [Utilizador, { model: Badge, include: [Nivel] }]
        });
        if(!pedido) return res.status(404).json({ success: false, message: 'Pedido nao encontrado' });
        
        const evidencias = await Evidencia.findAll({
            where: { ID_PEDIDO: idPedido },
            include: [{ model: Requisito, required: false }]
        });
        const historicos = await obterHistoricoDoPedido(idPedido);
        const ultimoHistorico = historicos.length > 0 ? historicos[historicos.length - 1] : null;
        const requisitosBadge = await Requisito.findAll({ where: { ID_BADGE: pedido.ID_BADGE } });
        const totalRequisitos = requisitosBadge.length;
        const nivelLetra = pedido.Badge.Nivel
            ? String.fromCharCode(64 + pedido.Badge.Nivel.ORDEM_HIERARQUICA)
            : '';
        
        let catObj = { serviceLine: pedido.Badge.CATEGORIA_BADGE, area: pedido.Badge.CATEGORIA_BADGE };
        try {
            if (pedido.Badge.CATEGORIA_BADGE.startsWith('{')) {
                catObj = JSON.parse(pedido.Badge.CATEGORIA_BADGE);
            }
        } catch(e) {}
        
        const dataFormatada = {
            id: pedido.ID_PEDIDO,
            titulo: pedido.Badge.NOME_BADGE,
            status: pedido.ESTADO_PEDIDO,
            ultimoEstado: new Date(pedido.DATA_ULTIMA_ATUALIZACAO).toLocaleString('pt-PT'),
            corStatus: pedido.ESTADO_PEDIDO === 'Aceite' ? 'success' : (pedido.ESTADO_PEDIDO === 'Recusado' ? 'danger' : 'info'),
            consultor: pedido.Utilizador.NOME_COMPLETO_UTILIZADOR,
            serviceLine: catObj.serviceLine,
            observacoes: descricaoDecisaoHistorico(ultimoHistorico),
            infoBadge: {
                idBadge: pedido.ID_BADGE,
                area: catObj.area,
                nivelExtenso: pedido.Badge.Nivel ? pedido.Badge.Nivel.NOME_NIVEL : 'N/A',
                nivel: pedido.Badge.Nivel ? String.fromCharCode(64 + pedido.Badge.Nivel.ORDEM_HIERARQUICA) : 'E',
                requisitos: totalRequisitos, 
                pontos: pedido.Badge.PONTOS_BADGE,
                validadePadrao: pedido.Badge.VALIDADE_EXPIRACAO
                    ? `Até ${new Date(pedido.Badge.VALIDADE_EXPIRACAO).toLocaleDateString('pt-PT')}`
                    : (pedido.Badge.VALIDADE_MESES ? `${pedido.Badge.VALIDADE_MESES} meses` : 'Vitalício')
            },
            timeline: historicos.map(h => ({
                data: new Date(h.DATA_REGISTO_PEDIDO).toLocaleDateString('pt-PT'),
                user: h.Utilizador ? h.Utilizador.NOME_COMPLETO_UTILIZADOR : 'Sistema',
                acao: `${h.TIPO_ACAO}${h.COMENTARIO_VALIDADOR ? ' com comentário: ' + h.COMENTARIO_VALIDADOR : ''}`,
                iconType: h.STATUS_RESULTADO || 'info'
            })),
            evidencias: formatarEvidencias(req, evidencias, requisitosBadge, nivelLetra).map(e => ({
                ...e,
                status: pedido.ESTADO_PEDIDO
            }))
        };
        
        res.json({ success: true, data: dataFormatada });
    } catch (e) {
        res.status(500).json({ success: false, message: e.message });
    }
};

controllers.renovarPedido = async (req, res) => {
    try {
        const { idUtilizador, idBadge } = req.body;
        const consultor = await Consultor.findOne({ where: { ID_UTILIZADOR: idUtilizador } });
        if (!consultor) {
            return res.status(404).json({ success: false, message: 'Consultor não encontrado.' });
        }

        const badgeObtido = await ConsultorBadge.findOne({
            where: { ID_CONSULTOR: consultor.ID_CONSULTOR, ID_BADGE: idBadge }
        });
        if (!badgeObtido) {
            return res.status(404).json({ success: false, message: 'Badge obtido não encontrado.' });
        }

        const diasRestantes = badgeObtido.DATA_EXPIRACAO
            ? Math.ceil((new Date(badgeObtido.DATA_EXPIRACAO) - new Date()) / (1000 * 60 * 60 * 24))
            : null;
        if (diasRestantes === null || diasRestantes > 30) {
            return res.status(400).json({
                success: false,
                message: 'A renovação fica disponível nos últimos 30 dias de validade.'
            });
        }

        const rascunhoVazio = await Pedido.findOne({
            where: {
                ID_UTILIZADOR: idUtilizador,
                ID_BADGE: idBadge,
                ESTADO_PEDIDO: 'Rascunho'
            },
            order: [['DATA_ULTIMA_ATUALIZACAO', 'DESC']]
        });
        if (rascunhoVazio) {
            const totalEvidencias = await Evidencia.count({ where: { ID_PEDIDO: rascunhoVazio.ID_PEDIDO } });
            if (totalEvidencias === 0) {
                await rascunhoVazio.destroy();
            }
        }

        if (diasRestantes <= 0) {
            await badgeObtido.destroy();
            res.json({
                success: true,
                message: 'Renovação disponibilizada. O badge expirou e foi removido. O rascunho será criado quando anexar evidências.'
            });
        } else {
            // Se tem mais de 0 dias (ex: 15 dias), mantém o badge obtido para que some o tempo quando for aprovado
            res.json({
                success: true,
                message: 'Renovação iniciada. O badge mantém-se ativo até à aprovação, que somará os dias restantes.'
            });
        }
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

controllers.getPendentesTM = async (req, res) => {
    try {
        await limparPedidosAtivosDuplicados();
        const pedidos = await Pedido.findAll({
            where: { ESTADO_PEDIDO: { [Op.in]: ['Pendente', 'Em Análise TM'] } },
            include: [Utilizador, { model: Badge, include: [Nivel] }],
            order: [['DATA_SUBMISSAO_PEDIDO', 'ASC']]
        });

        const [aprovadosTotal, rejeitadosTotal] = await Promise.all([
            Pedido.count({ where: { ESTADO_PEDIDO: 'Aceite' } }),
            Pedido.count({ where: { ESTADO_PEDIDO: 'Recusado' } })
        ]);

        const data = pedidos.map(pedido => {
            let categoria = {};
            try { categoria = JSON.parse(pedido.Badge?.CATEGORIA_BADGE || '{}'); } catch (_) {}
            return {
                id: pedido.ID_PEDIDO,
                idPedido: `PED-${pedido.ID_PEDIDO}`,
                consultor: pedido.Utilizador?.NOME_COMPLETO_UTILIZADOR || 'Desconhecido',
                sl: categoria.serviceLine || 'Indefinida',
                badge: pedido.Badge?.NOME_BADGE || 'Badge indisponível',
                data: new Date(pedido.DATA_SUBMISSAO_PEDIDO).toLocaleDateString('pt-PT')
            };
        });

        res.json({ success: true, data, kpis: { aprovadosTotal, rejeitadosTotal } });
    } catch (e) {
        res.status(500).json({ success: false, message: e.message });
    }
};

controllers.getDetalhesAnalisarTM = async (req, res) => {
    try {
        const { id } = req.params;
        const pedido = await Pedido.findByPk(id, { include: [Utilizador, { model: Badge, include: [Nivel] }] });
        if (!pedido) return res.status(404).json({ success: false, message: 'Pedido não encontrado' });
        if (req.originalUrl.includes('/sll/')) {
            const serviceLine = await obterServiceLineSLL(req);
            if (!serviceLine || !badgePertenceServiceLine(pedido.Badge, serviceLine)) {
                return res.status(403).json({
                    success: false,
                    message: 'Este pedido não pertence à Service Line do SLL.'
                });
            }
        }
        const evidencias = await Evidencia.findAll({
            where: { ID_PEDIDO: id },
            include: [{ model: Requisito, required: false }]
        });
        const historicos = await obterHistoricoDoPedido(id);
        const requisitosBadge = await Requisito.findAll({ where: { ID_BADGE: pedido.ID_BADGE } });
        const totalRequisitos = requisitosBadge.length;
        let categoria = {};
        try { categoria = JSON.parse(pedido.Badge.CATEGORIA_BADGE || '{}'); } catch (_) {}
        const nivelLetra = pedido.Badge.Nivel ? String.fromCharCode(64 + pedido.Badge.Nivel.ORDEM_HIERARQUICA) : '?';

        res.json({ success: true, data: {
            idPedido: pedido.ID_PEDIDO,
            idBadge: pedido.ID_BADGE,
            badgeName: pedido.Badge.NOME_BADGE,
            foto: pedido.Badge.URL_IMAGEM,
            consultor: pedido.Utilizador.NOME_COMPLETO_UTILIZADOR,
            sl: categoria.serviceLine || 'N/A',
            area: categoria.area || 'N/A',
            nivel: `${nivelLetra} (${pedido.Badge.Nivel?.NOME_NIVEL || 'N/A'})`,
            validade: pedido.Badge.VALIDADE_EXPIRACAO ? null : pedido.Badge.VALIDADE_MESES,
            validadeData: pedido.Badge.VALIDADE_EXPIRACAO,
            pontos: pedido.Badge.PONTOS_BADGE,
            estado: pedido.ESTADO_PEDIDO,
            reqsNecessarios: totalRequisitos,
            timeline: historicos.map(h => ({ data: new Date(h.DATA_REGISTO_PEDIDO).toLocaleString('pt-PT'), user: h.Utilizador?.NOME_COMPLETO_UTILIZADOR || 'Sistema', acao: `${h.TIPO_ACAO}${h.COMENTARIO_VALIDADOR ? ` — ${h.COMENTARIO_VALIDADOR}` : ''}` })),
            evidencias: formatarEvidencias(req, evidencias, requisitosBadge, nivelLetra).map(e => ({
                ...e,
                status: pedido.ESTADO_PEDIDO,
                color: 'text-primary'
            }))
        }});
    } catch (e) {
        res.status(500).json({ success: false, message: e.message });
    }
};

controllers.tomarDecisaoTM = async (req, res) => {
    try {
        const { id } = req.params;
        const decisao = req.body.decisao || req.body.acao;
        const comentario = req.body.feedback ?? req.body.comentario ?? '';
        const validadorId = req.userId || req.body.idUtilizadorAtivo || req.body.validadorId;
        const pedido = await Pedido.findByPk(id, { include: [Badge] });
        if (!pedido) return res.status(404).json({ success: false, message: 'Pedido não encontrado' });
        if (!['Pendente', 'Em Análise TM'].includes(pedido.ESTADO_PEDIDO)) {
            return res.status(409).json({
                success: false,
                message: `Este pedido já não aguarda decisão do Talent Manager. Estado atual: ${pedido.ESTADO_PEDIDO}.`
            });
        }

        const estadoAnterior = pedido.ESTADO_PEDIDO;
        const novoEstado = decisao === 'SLL' || decisao === 'APROVAR' ? 'Em Análise SLL' : 'Recusado';
        const validador = validadorId ? await Utilizador.findByPk(validadorId) : null;
        const nomeValidador = validador?.NOME_COMPLETO_UTILIZADOR || 'Talent Manager';
        const nomeBadge = pedido.Badge?.NOME_BADGE || `Badge ${pedido.ID_BADGE}`;
        const mensagemAvaliador = String(comentario || '').trim() || 'Sem mensagem adicional.';
        await pedido.update({ ESTADO_PEDIDO: novoEstado, DATA_ULTIMA_ATUALIZACAO: new Date(), ID_TM: validadorId || null });
        await registarHistoricoPedido({ idPedido: id, idUtilizador: validadorId, estado: novoEstado, acao: novoEstado === 'Recusado' ? 'Rejeitou o pedido' : 'Validou e enviou para o SLL', comentario, perfil: 'Talent Manager', resultado: novoEstado === 'Recusado' ? 'danger' : 'success' });
        await LogAtividadeSistema.create({ ID_UTILIZADOR: validadorId, TIPO_ATIVIDADE: novoEstado === 'Recusado' ? 'Rejeição TM' : 'Validação TM', DETALHES_ATIVIDADE: `Talent Manager alterou o pedido ${id} para ${novoEstado}`, DATA_HORA_ATIVIDADE: new Date() });

        const pushService = require('../services/pushService');
        const consultor = await Utilizador.findByPk(pedido.ID_UTILIZADOR);
        if (consultor) {
            const titulo = novoEstado === 'Recusado'
                ? 'Candidatura Rejeitada'
                : 'Candidatura Validada pelo Talent Manager';
            const mensagem = novoEstado === 'Recusado'
                ? [
                    `A candidatura ao badge "${nomeBadge}" foi rejeitada por ${nomeValidador} (Talent Manager).`,
                    `Mensagem: ${mensagemAvaliador}`,
                    'Consulte o histórico do pedido para ver os detalhes.'
                ].join('\n\n')
                : [
                    `A candidatura ao badge "${nomeBadge}" foi aceite por ${nomeValidador} (Talent Manager).`,
                    'Estado: enviada para validação final do Service Line Leader.',
                    `Mensagem: ${mensagemAvaliador}`
                ].join('\n\n');
            pushService.sendPush(consultor.ID_UTILIZADOR, novoEstado === 'Recusado' ? 'warning' : 'info', titulo, mensagem, 'validacao', consultor.PERFIL_UTILIZADOR);
            try {
                mailer.sendEmail(
                    consultor.EMAIL_UTILIZADOR,
                    `${titulo} - Plataforma de Badges Softinsa`,
                    `<h2>${titulo}</h2><p>Olá, ${consultor.NOME_COMPLETO_UTILIZADOR}.</p>${mensagem.split('\n\n').map(paragrafo => `<p>${paragrafo}</p>`).join('')}`,
                    'validacao',
                    'Consultor'
                );
            } catch (mailErr) {
                console.error('Falha ao enviar email da decisão do Talent Manager:', mailErr);
            }
        }

        if (novoEstado === 'Em Análise SLL' && pedido.Badge) {
            let categoria = {};
            try { categoria = JSON.parse(pedido.Badge.CATEGORIA_BADGE || '{}'); } catch (_) {}
            const serviceLineBadge = categoria.serviceLine;
            if (serviceLineBadge) {
                const utilizadoresSLL = await Utilizador.findAll({
                    where: {
                        ESTADO_CONTA_UTILIZADOR: 'Ativo',
                        [Op.or]: [
                            { PERFIL_UTILIZADOR: { [Op.like]: '%Service Line Leader%' } },
                            { PERFIL_UTILIZADOR: { [Op.like]: '%SLL%' } }
                        ]
                    }
                });
                for (const sll of utilizadoresSLL) {
                    const serviceLineSLL = await resolverServiceLineSLL(sll.ID_UTILIZADOR);
                    if (serviceLineSLL !== serviceLineBadge) continue;
                    const mensagemSLL = [
                        `A candidatura de ${consultor?.NOME_COMPLETO_UTILIZADOR || `utilizador ${pedido.ID_UTILIZADOR}`} ao badge "${nomeBadge}" foi aceite por ${nomeValidador} (Talent Manager).`,
                        'Estado: aguarda a sua decisão final.',
                        `Mensagem: ${mensagemAvaliador}`,
                        'Aceda a Validações → Pedidos Pendentes.'
                    ].join('\n\n');
                    const pushService = require('../services/pushService');
                    pushService.sendPush(
                        sll.ID_UTILIZADOR,
                        'info',
                        'Nova Candidatura para Validação Final',
                        mensagemSLL,
                        'pedidos',
                        'Service Line Leader'
                    );
                    try {
                        mailer.sendEmail(
                            sll.EMAIL_UTILIZADOR,
                            'Nova Candidatura para Validação Final - Plataforma de Badges Softinsa',
                            `<h2>Validação final pendente</h2><p>Olá, ${sll.NOME_COMPLETO_UTILIZADOR}.</p>${mensagemSLL.split('\n\n').map(paragrafo => `<p>${paragrafo}</p>`).join('')}`,
                            'pedidos',
                            'Service Line Leader'
                        );
                    } catch (mailErr) {
                        console.error('Falha ao enviar email de candidatura ao SLL:', mailErr);
                    }
                }
            }
        }

        res.json({ success: true, message: 'Decisão guardada', estado: novoEstado });
    } catch (e) {
        res.status(500).json({ success: false, message: e.message });
    }
};

controllers.getHistoricoTM = async (req, res) => {
    try {
        await limparPedidosAtivosDuplicados();
        const historicos = await HistoricoPedido.findAll({
            where: { PERFIL_DECISOR: 'Talent Manager' },
            include: [Utilizador],
            order: [['DATA_REGISTO_PEDIDO', 'DESC']]
        });

        const idsHistorico = historicos.map(h => h.ID_HISTORICO);
        const relacoes = idsHistorico.length > 0 ? await RegistoHistoricoPedido.findAll({
            where: { ID_HISTORICO: { [Op.in]: idsHistorico } }
        }) : [];
        const idsPedidos = [...new Set(relacoes.map(r => r.ID_PEDIDO))];
        const pedidosHistorico = idsPedidos.length > 0 ? await Pedido.findAll({
            where: { ID_PEDIDO: { [Op.in]: idsPedidos } },
            include: [Utilizador, { model: Badge, include: [Nivel] }]
        }) : [];
        const pedidosPorId = new Map(pedidosHistorico.map(p => [p.ID_PEDIDO, p]));

        const formatarPedido = (pedido, historico, origem = 'historico') => {
            let categoria = {};
            try { categoria = JSON.parse(pedido.Badge?.CATEGORIA_BADGE || '{}'); } catch (_) {}
            const recusadoPeloTM = historico
                ? historico.ESTADO_ATUAL_PEDIDO === 'Recusado' || historico.TIPO_ACAO?.toLowerCase().includes('rejeitou')
                : pedido.ESTADO_PEDIDO === 'Recusado' && !pedido.ID_SLL;
            const dataDecisao = historico?.DATA_REGISTO_PEDIDO || pedido.DATA_ULTIMA_ATUALIZACAO;
            return {
                id: pedido.ID_PEDIDO,
                recordKey: origem === 'historico' ? `H-${historico.ID_HISTORICO}` : `P-${pedido.ID_PEDIDO}`,
                consultor: pedido.Utilizador?.NOME_COMPLETO_UTILIZADOR || 'Desconhecido',
                sl: categoria.serviceLine || 'Indefinida',
                badge: pedido.Badge?.NOME_BADGE || 'Badge indisponível',
                data: new Date(dataDecisao).toLocaleString('pt-PT'),
                dataISO: new Date(dataDecisao).toISOString(),
                status: recusadoPeloTM ? 'Recusado pelo Talent Manager' : 'Aceite pelo Talent Manager',
                comentario: historico?.COMENTARIO_VALIDADOR || 'Nenhum comentário adicional',
                avaliador: historico?.Utilizador?.NOME_COMPLETO_UTILIZADOR || 'Talent Manager'
            };
        };

        const data = [];
        const pedidosComHistorico = new Set();
        for (const historico of historicos) {
            const relacao = relacoes.find(r => r.ID_HISTORICO === historico.ID_HISTORICO);
            const pedido = relacao ? pedidosPorId.get(relacao.ID_PEDIDO) : null;
            if (!pedido) continue;
            pedidosComHistorico.add(pedido.ID_PEDIDO);
            data.push(formatarPedido(pedido, historico));
        }

        // Recupera decisões antigas nas quais o pedido foi atualizado, mas o histórico não foi criado.
        const pedidosAntigos = await Pedido.findAll({
            where: { ID_TM: { [Op.ne]: null } },
            include: [Utilizador, { model: Badge, include: [Nivel] }]
        });
        for (const pedido of pedidosAntigos) {
            if (!pedidosComHistorico.has(pedido.ID_PEDIDO)) data.push(formatarPedido(pedido, null, 'pedido'));
        }

        data.sort((a, b) => new Date(b.dataISO) - new Date(a.dataISO));
        res.json({ success: true, data });
    } catch (e) {
        res.status(500).json({ success: false, message: e.message });
    }
};

controllers.getPendentesSLL = async (req, res) => {
    try {
        await limparPedidosAtivosDuplicados();
        const serviceLine = await obterServiceLineSLL(req);
        if (!serviceLine) {
            return res.status(400).json({ success: false, message: 'Service Line do SLL não identificada' });
        }

        const pedidos = await Pedido.findAll({
            where: { ESTADO_PEDIDO: 'Em Análise SLL' },
            include: [
                Utilizador,
                {
                    model: Badge,
                    where: { CATEGORIA_BADGE: { [Op.like]: `%${serviceLine}%` } },
                    include: [Nivel]
                }
            ],
            order: [['DATA_SUBMISSAO_PEDIDO', 'ASC']]
        });
        const pedidosDaSL = pedidos.filter(p => badgePertenceServiceLine(p.Badge, serviceLine));

        const formatarPedido = pedido => {
            let categoria = {};
            try { categoria = JSON.parse(pedido.Badge.CATEGORIA_BADGE); } catch (e) {}
            const nivel = pedido.Badge.Nivel?.NOME_NIVEL
                || String.fromCharCode(64 + (pedido.Badge.Nivel?.ORDEM_HIERARQUICA || 1));
            return {
                id: pedido.ID_PEDIDO,
                consultor: pedido.Utilizador?.NOME_COMPLETO_UTILIZADOR || 'Desconhecido',
                badge: pedido.Badge?.NOME_BADGE || 'Badge',
                area: categoria.area || 'Geral',
                nivel,
                data: new Date(pedido.DATA_SUBMISSAO_PEDIDO).toLocaleDateString('pt-PT')
            };
        };

        const countDecisoes = async estado => {
            const encontrados = await Pedido.findAll({
                where: { ESTADO_PEDIDO: estado, ID_SLL: { [Op.ne]: null } },
                include: [{
                    model: Badge,
                    where: { CATEGORIA_BADGE: { [Op.like]: `%${serviceLine}%` } }
                }]
            });
            return encontrados.filter(p => badgePertenceServiceLine(p.Badge, serviceLine)).length;
        };
        const [aprovadosTotal, rejeitadosTotal] = await Promise.all([
            countDecisoes('Aceite'),
            countDecisoes('Recusado')
        ]);
        const totalDecididos = aprovadosTotal + rejeitadosTotal;

        res.json({
            success: true,
            data: pedidosDaSL.map(formatarPedido),
            kpis: {
                aprovadosTotal,
                rejeitadosTotal,
                taxaAprovacao: totalDecididos ? Math.round((aprovadosTotal / totalDecididos) * 100) : 0,
                taxaRejeicao: totalDecididos ? Math.round((rejeitadosTotal / totalDecididos) * 100) : 0
            }
        });
    } catch (e) {
        res.status(500).json({ success: false, message: e.message });
    }
};

controllers.tomarDecisaoSLL = async (req, res) => {
    try {
        const { id } = req.params;
        const decisao = req.body.decisao || req.body.novoEstado;
        const comentario = req.body.feedback ?? req.body.comentario ?? '';
        const sllId = req.userId || req.body.idUtilizadorAtivo || req.body.sllId;
        const pedido = await Pedido.findByPk(id, { include: [Badge] });
        if (!pedido) return res.status(404).json({ success: false, message: 'Pedido não encontrado' });
        const serviceLine = await obterServiceLineSLL(req);
        if (!badgePertenceServiceLine(pedido.Badge, serviceLine)) {
            return res.status(403).json({ success: false, message: 'Este pedido não pertence à Service Line do SLL' });
        }

        const mapaEstados = { APROVAR: 'Aceite', REJEITAR: 'Recusado', VOLTA: 'Rascunho' };
        const novoEstado = mapaEstados[decisao] || decisao;
        if (!['Aceite', 'Recusado', 'Rascunho'].includes(novoEstado)) return res.status(400).json({ success: false, message: 'Decisão inválida' });
        if (pedido.ESTADO_PEDIDO !== 'Em Análise SLL') {
            return res.status(409).json({
                success: false,
                message: `Este pedido já não aguarda decisão do SLL. Estado atual: ${pedido.ESTADO_PEDIDO}.`
            });
        }
        const estadoAnterior = pedido.ESTADO_PEDIDO;
        const avaliadorSLL = sllId ? await Utilizador.findByPk(sllId) : null;
        const nomeAvaliadorSLL = avaliadorSLL?.NOME_COMPLETO_UTILIZADOR || 'Service Line Leader';
        const nomeBadge = pedido.Badge?.NOME_BADGE || `Badge ${pedido.ID_BADGE}`;
        const mensagemAvaliador = String(comentario || '').trim() || 'Sem mensagem adicional.';
        await pedido.update({ ESTADO_PEDIDO: novoEstado, DATA_ULTIMA_ATUALIZACAO: new Date(), ID_SLL: sllId || null });

        if (novoEstado === 'Aceite') {
            await fecharPedidosConcorrentesDoBadge({
                idPedidoAceite: pedido.ID_PEDIDO,
                idUtilizador: pedido.ID_UTILIZADOR,
                idBadge: pedido.ID_BADGE
            });

            const Consultor = require('../models/Consultor');
            const ConsultorBadge = require('../models/ConsultorBadge');
            const consultor = await Consultor.findOne({ where: { ID_UTILIZADOR: pedido.ID_UTILIZADOR } });
            if (!consultor) return res.status(400).json({ success: false, message: 'Perfil de consultor não encontrado' });
            const existente = await ConsultorBadge.findOne({ where: { ID_CONSULTOR: consultor.ID_CONSULTOR, ID_BADGE: pedido.ID_BADGE } });
            if (!existente) {
                const dataExpiracao = calcularNovaDataExpiracao(pedido.Badge, null);
                await ConsultorBadge.create({ ID_CONSULTOR: consultor.ID_CONSULTOR, ID_BADGE: pedido.ID_BADGE, DATA_ATRIBUICAO_BADGE: new Date(), MOTIVO_ATRIBUICAO: 'Aprovação final do SLL', DATA_EXPIRACAO: dataExpiracao, LINK_UNICO_BADGE: `badge-${pedido.ID_BADGE}-${consultor.ID_CONSULTOR}-${Date.now()}`, STATUS_GALERIA_PUBLICA: true });
                const pontosBadge = pedido.Badge.PONTOS_BADGE || 0;
                await consultor.update({ PONTUACAO_TOTAL: (consultor.PONTUACAO_TOTAL || 0) + pontosBadge });
                await HistoricoPontuacao.create({
                    ID_UTILIZADOR: pedido.ID_UTILIZADOR,
                    DATA_ATRIBUICAO: new Date(),
                    PONTOS_OBTIDOS: pontosBadge,
                    ORIGEM_PONTOS: `Badge: ${pedido.Badge.NOME_BADGE}`
                });
                await LogAtividadeSistema.create({ ID_UTILIZADOR: pedido.ID_UTILIZADOR, TIPO_ATIVIDADE: 'Badge Obtido', DETALHES_ATIVIDADE: `Ganhou o badge ${pedido.Badge.NOME_BADGE}`, DATA_HORA_ATIVIDADE: new Date() });
                await avaliarConquistasConsultor(consultor);
            } else {
                // É uma renovação. Atualizamos a data de expiração e os pontos.
                const novaExpiracao = calcularNovaDataExpiracao(pedido.Badge, existente.DATA_EXPIRACAO);
                await existente.update({ DATA_EXPIRACAO: novaExpiracao });
                const pontosBadge = pedido.Badge.PONTOS_BADGE || 0;
                await consultor.update({ PONTUACAO_TOTAL: (consultor.PONTUACAO_TOTAL || 0) + pontosBadge });
                await HistoricoPontuacao.create({
                    ID_UTILIZADOR: pedido.ID_UTILIZADOR,
                    DATA_ATRIBUICAO: new Date(),
                    PONTOS_OBTIDOS: pontosBadge,
                    ORIGEM_PONTOS: `Renovação de Badge: ${pedido.Badge.NOME_BADGE}`
                });
                await LogAtividadeSistema.create({ ID_UTILIZADOR: pedido.ID_UTILIZADOR, TIPO_ATIVIDADE: 'Badge Renovado', DETALHES_ATIVIDADE: `Renovou o badge ${pedido.Badge.NOME_BADGE}`, DATA_HORA_ATIVIDADE: new Date() });
            }
        }

        await registarHistoricoPedido({ idPedido: id, idUtilizador: sllId, estado: novoEstado, acao: novoEstado === 'Aceite' ? 'Aprovou o pedido' : (novoEstado === 'Recusado' ? 'Rejeitou o pedido' : 'Devolveu para correção'), comentario, perfil: 'Service Line Leader', resultado: novoEstado === 'Aceite' ? 'success' : (novoEstado === 'Recusado' ? 'danger' : 'pending') });
        await LogAtividadeSistema.create({ ID_UTILIZADOR: sllId, TIPO_ATIVIDADE: novoEstado === 'Aceite' ? 'Aprovação SLL' : (novoEstado === 'Recusado' ? 'Rejeição SLL' : 'Devolução SLL'), DETALHES_ATIVIDADE: `SLL alterou o pedido ${id} para ${novoEstado}`, DATA_HORA_ATIVIDADE: new Date() });

        const pushService = require('../services/pushService');
        const utilizador = await Utilizador.findByPk(pedido.ID_UTILIZADOR);
        if (utilizador) {
            const titulos = { Aceite: 'Badge Atribuído', Recusado: 'Candidatura Rejeitada', Rascunho: 'Candidatura Devolvida para Correção' };
            let mensagem = novoEstado === 'Aceite'
                ? [
                    `Parabéns, obteve o badge "${nomeBadge}"!`,
                    `A sua candidatura foi aceite por ${nomeAvaliadorSLL} (Service Line Leader).`,
                    `Mensagem: ${mensagemAvaliador}`,
                    'Para consultar o badge obtido, aceda a Meus Badges.',
                    'A partir dessa página pode ver os detalhes, descarregar o certificado, copiar o link público de validação e partilhar a conquista no LinkedIn.'
                ].join('\n\n')
                : [
                    `A candidatura ao badge "${nomeBadge}" foi rejeitada por ${nomeAvaliadorSLL} (Service Line Leader).`,
                    `Mensagem: ${mensagemAvaliador}`,
                    'Pode consultar o histórico do pedido para rever a decisão e preparar uma nova candidatura quando fizer sentido.'
                ].join('\n\n');
            if (novoEstado === 'Rascunho') {
                mensagem = [
                    `A candidatura ao badge "${nomeBadge}" foi enviada de volta para correção por ${nomeAvaliadorSLL} (Service Line Leader).`,
                    `Mensagem: ${mensagemAvaliador}`,
                    'No web: Dashboard → A Minha Jornada de Carreira → Continuar.',
                    'No mobile: Dashboard → Aprendizagens Ativas → carregar no rascunho.',
                    'Reveja ou substitua as evidências indicadas e submeta novamente a candidatura.'
                ].join('\n\n');
            }
            pushService.sendPush(utilizador.ID_UTILIZADOR, novoEstado === 'Aceite' ? 'success' : 'warning', titulos[novoEstado], mensagem, 'validacao', utilizador.PERFIL_UTILIZADOR);
            try {
                mailer.sendEmail(
                    utilizador.EMAIL_UTILIZADOR,
                    `${titulos[novoEstado]} - Plataforma de Badges Softinsa`,
                    `<h2>${titulos[novoEstado]}</h2><p>Olá, ${utilizador.NOME_COMPLETO_UTILIZADOR}.</p>${mensagem.split('\n\n').map(paragrafo => `<p>${paragrafo}</p>`).join('')}`,
                    'validacao',
                    'Consultor'
                );
            } catch (mailErr) {
                console.error('Falha ao enviar email da decisão do Service Line Leader:', mailErr);
            }
        }
        res.json({ success: true, message: 'Decisão SLL guardada', estado: novoEstado });
    } catch (e) {
        res.status(500).json({ success: false, message: e.message });
    }
};

controllers.getHistoricoSLL = async (req, res) => {
    try {
        const serviceLine = await obterServiceLineSLL(req);
        if (!serviceLine) {
            return res.status(400).json({ success: false, message: 'Service Line do SLL não identificada' });
        }

        const historicos = await HistoricoPedido.findAll({
            where: { PERFIL_DECISOR: 'Service Line Leader' },
            include: [Utilizador],
            order: [['DATA_REGISTO_PEDIDO', 'DESC']]
        });
        const idsHistorico = historicos.map(h => h.ID_HISTORICO);
        const relacoes = idsHistorico.length ? await RegistoHistoricoPedido.findAll({
            where: { ID_HISTORICO: { [Op.in]: idsHistorico } }
        }) : [];
        const idsPedidos = [...new Set(relacoes.map(r => r.ID_PEDIDO))];
        const pedidos = idsPedidos.length ? await Pedido.findAll({
            where: { ID_PEDIDO: { [Op.in]: idsPedidos } },
            include: [Utilizador, { model: Badge, include: [Nivel] }]
        }) : [];
        const pedidosPorId = new Map(
            pedidos
                .filter(p => badgePertenceServiceLine(p.Badge, serviceLine))
                .map(p => [p.ID_PEDIDO, p])
        );

        const formatar = (pedido, historico, origem = 'historico') => {
            let categoria = {};
            try { categoria = JSON.parse(pedido.Badge.CATEGORIA_BADGE); } catch (e) {}
            const devolvido = historico?.TIPO_ACAO?.toLowerCase().includes('devolveu')
                || historico?.ESTADO_ATUAL_PEDIDO === 'Rascunho';
            const estado = devolvido
                ? 'Envio de volta'
                : (historico?.ESTADO_ATUAL_PEDIDO || pedido.ESTADO_PEDIDO);
            const dataDecisao = historico?.DATA_REGISTO_PEDIDO || pedido.DATA_ULTIMA_ATUALIZACAO;
            return {
                id: pedido.ID_PEDIDO,
                recordKey: origem === 'historico' ? `H-${historico.ID_HISTORICO}` : `P-${pedido.ID_PEDIDO}`,
                consultor: pedido.Utilizador?.NOME_COMPLETO_UTILIZADOR || 'Desconhecido',
                badge: pedido.Badge?.NOME_BADGE || 'Badge',
                area: categoria.area || 'Geral',
                nivel: pedido.Badge?.Nivel?.NOME_NIVEL || 'Nível',
                data: new Date(dataDecisao).toLocaleString('pt-PT'),
                dataISO: new Date(dataDecisao).toISOString(),
                status: estado,
                comentario: historico?.COMENTARIO_VALIDADOR || 'Sem comentário'
            };
        };

        const data = [];
        const pedidosComHistorico = new Set();
        for (const historico of historicos) {
            const relacao = relacoes.find(r => r.ID_HISTORICO === historico.ID_HISTORICO);
            const pedido = relacao ? pedidosPorId.get(relacao.ID_PEDIDO) : null;
            if (!pedido) continue;
            // Os históricos estão ordenados do mais recente para o mais antigo.
            // Mantém apenas a última ação do SLL para cada candidatura, mesmo que
            // outro perfil altere posteriormente o estado global do pedido.
            if (pedidosComHistorico.has(pedido.ID_PEDIDO)) continue;
            pedidosComHistorico.add(pedido.ID_PEDIDO);
            data.push(formatar(pedido, historico));
        }

        const pedidosAntigos = await Pedido.findAll({
            where: { ID_SLL: { [Op.ne]: null } },
            include: [Utilizador, { model: Badge, include: [Nivel] }]
        });
        for (const pedido of pedidosAntigos) {
            if (!pedidosComHistorico.has(pedido.ID_PEDIDO) && badgePertenceServiceLine(pedido.Badge, serviceLine)) {
                data.push(formatar(pedido, null, 'pedido'));
            }
        }

        data.sort((a, b) => new Date(b.dataISO) - new Date(a.dataISO));
        res.json({ success: true, data });
    } catch (e) {
        res.status(500).json({ success: false, message: e.message });
    }
};

controllers.getTodosPedidosAdmin = async (req, res) => {
    try {
        await limparPedidosAtivosDuplicados();
        const pedidos = await Pedido.findAll({
            include: [Utilizador, { model: Badge, include: [Nivel] }]
        });
        
        const data = pedidos.map(p => {
            let catObj = { serviceLine: p.Badge.CATEGORIA_BADGE, area: p.Badge.CATEGORIA_BADGE };
            try {
                if (p.Badge.CATEGORIA_BADGE.startsWith('{')) {
                    catObj = JSON.parse(p.Badge.CATEGORIA_BADGE);
                }
            } catch(e) {}
            
            const letra = p.Badge.Nivel ? String.fromCharCode(64 + p.Badge.Nivel.ORDEM_HIERARQUICA) : 'E';
            const nivelExtenso = p.Badge.Nivel ? p.Badge.Nivel.NOME_NIVEL : 'N/A';
            
            return {
                id: p.ID_PEDIDO,
                consultor: p.Utilizador.NOME_COMPLETO_UTILIZADOR,
                sl: catObj.serviceLine,
                area: catObj.area,
                badge: p.Badge.NOME_BADGE,
                nivelExtenso: nivelExtenso,
                nivelLetra: letra,
                data: p.DATA_SUBMISSAO_PEDIDO,
                status: normalizarStatusAdmin(p.ESTADO_PEDIDO),
                comentario: p.COMENTARIO_CONSULTOR
            };
        });
        
        res.json({ success: true, data });
    } catch (e) {
        res.status(500).json({ success: false, message: e.message });
    }
};

controllers.eliminarPedidoAdmin = async (req, res) => {
    try {
        const { id } = req.params;
        const pedido = await Pedido.findByPk(id, {
            include: [
                { model: Badge },
                { model: Utilizador }
            ]
        });
        if (!pedido) return res.status(404).json({ success: false, message: "Pedido não encontrado" });
        await pedido.update({ ESTADO_PEDIDO: 'Eliminado', DATA_ULTIMA_ATUALIZACAO: new Date() });
        const admin = req.userId ? await Utilizador.findByPk(req.userId) : null;
        const nomeAdmin = admin?.NOME_COMPLETO_UTILIZADOR || 'Administrador';
        const nomeBadge = pedido.Badge?.NOME_BADGE || 'badge solicitado';
        await pushService.sendPush(
            pedido.ID_UTILIZADOR,
            'warning',
            'Pedido eliminado',
            `${nomeAdmin} eliminou o seu pedido para o badge "${nomeBadge}". Se pretender obter este badge, terá de submeter uma nova candidatura.`,
            'pedidos',
            'Consultor'
        );
        res.json({ success: true, message: 'Pedido eliminado' });
    } catch (e) {
        res.status(500).json({ success: false, message: e.message });
    }
};

module.exports = controllers;
