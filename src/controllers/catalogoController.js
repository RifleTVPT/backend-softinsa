const Badge = require('../models/Badge');
const Requisito = require('../models/Requisito');
const Pedido = require('../models/Pedido');
const Nivel = require('../models/Nivel');
const mailer = require('../config/mailer');
const pushService = require('../services/pushService');
const Evidencia = require('../models/Evidencia');
const ConfiguracoesSistema = require('../models/ConfiguracoesSistema');
const Utilizador = require('../models/Utilizador');
const LogAtividadeSistema = require('../models/LogAtividadeSistema');
const HistoricoPedido = require('../models/HistoricoPedido');
const RegistoHistoricoPedido = require('../models/RegistoHistoricoPedido');
const PreferenciasUtilizador = require('../models/PreferenciasUtilizador');
const { Op } = require('sequelize');
const { uploadDataUri, uploadMulterFile, uploadEvidenceMulterFile } = require('../services/cloudFileService');

const controllers = {};

const nomeImagemBadge = (dataUri) => {
    const match = String(dataUri || '').match(/^data:image\/([a-zA-Z0-9+.-]+);base64,/i);
    const tipo = match?.[1] || 'png';
    const ext = tipo.includes('svg') ? 'svg' : (tipo.includes('jpeg') ? 'jpg' : tipo.replace(/[^a-zA-Z0-9]/g, '') || 'png');
    return `badge_${Date.now()}.${ext}`;
};

// Helper: mapeia ID de nível para letra
const mapNivel = (id) => String.fromCharCode(64 + (id || 1));
const normalizarNomeFicheiro = nome => String(nome || '')
    .normalize('NFC')
    .replace(/\\/g, '/')
    .split('/')
    .pop();
const ficheiroCorresponde = (uploadedFile, nomeEsperado) => {
    const original = normalizarNomeFicheiro(uploadedFile?.originalname);
    const esperado = normalizarNomeFicheiro(nomeEsperado);
    if (original === esperado) return true;
    try {
        return normalizarNomeFicheiro(Buffer.from(original, 'latin1').toString('utf8')) === esperado;
    } catch (_) {
        return false;
    }
};

// 1. Listar todos os Badges para a grelha
controllers.getAllBadges = async (req, res) => {
    try {
        
        const badgesBD = await Badge.findAll({
            include: [
                { model: Requisito, as: 'requisitos' },
                { model: Nivel }
            ] 
        });

        // Mapear para o formato exato que o React pede
        const badgesFormatados = badgesBD.map(b => {
            let catObj = { serviceLine: b.CATEGORIA_BADGE, area: b.CATEGORIA_BADGE };
            try {
                if (b.CATEGORIA_BADGE.startsWith('{')) {
                    catObj = JSON.parse(b.CATEGORIA_BADGE);
                }
            } catch(e) {}

            return {
                id: b.ID_BADGE,
                titulo: b.NOME_BADGE,
                area: catObj.area,
                serviceLine: catObj.serviceLine,
                nivel: b.Nivel ? String.fromCharCode(64 + b.Nivel.ORDEM_HIERARQUICA) : 'E', 
                pontos: b.PONTOS_BADGE,
                requisitosCount: b.requisitos.length,
                URL_IMAGEM: b.URL_IMAGEM,
                urlImagem: b.URL_IMAGEM,
                isPremium: b.IS_PREMIUM
            };
        });

        res.json({ success: true, data: badgesFormatados });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// 2. Detalhes de um Badge específico
controllers.getBadgeDetails = async (req, res) => {
    try {
        const { id } = req.params;
        const badge = await Badge.findByPk(id, {
            include: [
                { model: Requisito, as: 'requisitos' },
                { model: Nivel }
            ]
        });

        if (!badge) {
            return res.status(404).json({ success: false, message: "Badge não encontrado" });
        }

        // Lógica de Caminho de Evolução (Simulando procura do nível anterior/próximo)
        const [nivelAnterior, nivelProximo] = await Promise.all([
            Nivel.findOne({
                where: {
                    ID_AREA: badge.Nivel.ID_AREA,
                    ORDEM_HIERARQUICA: badge.Nivel.ORDEM_HIERARQUICA - 1
                }
            }),
            Nivel.findOne({
                where: {
                    ID_AREA: badge.Nivel.ID_AREA,
                    ORDEM_HIERARQUICA: badge.Nivel.ORDEM_HIERARQUICA + 1
                }
            })
        ]);
        const [badgeAnterior, badgeProximo] = await Promise.all([
            nivelAnterior
                ? Badge.findOne({ where: { CATEGORIA_BADGE: badge.CATEGORIA_BADGE, ID_NIVEL: nivelAnterior.ID_NIVEL } })
                : null,
            nivelProximo
                ? Badge.findOne({ where: { CATEGORIA_BADGE: badge.CATEGORIA_BADGE, ID_NIVEL: nivelProximo.ID_NIVEL } })
                : null
        ]);

        let catObj = { serviceLine: badge.CATEGORIA_BADGE, area: badge.CATEGORIA_BADGE };
        try {
            if (badge.CATEGORIA_BADGE.startsWith('{')) {
                catObj = JSON.parse(badge.CATEGORIA_BADGE);
            }
        } catch(e) {}
        
        let nivelBadgeStr = badge.Nivel ? String.fromCharCode(64 + badge.Nivel.ORDEM_HIERARQUICA) : 'E';

        const badgeDetalhes = {
            id: badge.ID_BADGE,
            titulo: badge.NOME_BADGE,
            area: catObj.area,
            serviceLine: catObj.serviceLine,
            nivel: nivelBadgeStr,
            pontos: badge.PONTOS_BADGE,
            validadeAnos: badge.VALIDADE_MESES ? Math.round(badge.VALIDADE_MESES / 12 * 10) / 10 : null,
            validadeDias: badge.VALIDADE_EXPIRACAO
                ? Math.max(0, Math.ceil((new Date(badge.VALIDADE_EXPIRACAO) - new Date()) / (1000 * 60 * 60 * 24)))
                : (badge.VALIDADE_MESES ? badge.VALIDADE_MESES * 30 : null),
            validadeMeses: badge.VALIDADE_EXPIRACAO ? null : (badge.VALIDADE_MESES || null),
            validadeExpiracao: badge.VALIDADE_EXPIRACAO ? new Date(badge.VALIDADE_EXPIRACAO).toISOString() : null,
            hasValidade: Boolean(badge.VALIDADE_MESES || badge.VALIDADE_EXPIRACAO),
            descricao: badge.DESCRICAO_BADGE || "Sem descrição disponível.",
            urlImagem: badge.URL_IMAGEM,
            isPremium: badge.IS_PREMIUM,
            requisitos: badge.requisitos.map((r, index) => ({
                id: r.ID_REQUISITO,
                dbId: r.ID_REQUISITO_PADRAO,
                isPadrao: !!r.ID_REQUISITO_PADRAO,
                titulo: r.TITULO_REQUISITO,
                desc: r.DESCRICAO_REQUISITO
            })),
            anterior: badgeAnterior ? { 
                id: badgeAnterior.ID_BADGE, 
                titulo: badgeAnterior.NOME_BADGE,
                nivel: String.fromCharCode(64 + nivelAnterior.ORDEM_HIERARQUICA),
                area: catObj.area,
                serviceLine: catObj.serviceLine
            } : null,
            proximo: badgeProximo ? { 
                id: badgeProximo.ID_BADGE, 
                titulo: badgeProximo.NOME_BADGE,
                nivel: String.fromCharCode(64 + nivelProximo.ORDEM_HIERARQUICA),
                area: catObj.area,
                serviceLine: catObj.serviceLine
            } : null
        };

        res.json({ success: true, data: badgeDetalhes });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// 2.5 Criar um Badge pelo Admin
controllers.createBadge = async (req, res) => {
    try {
        const { 
            nome, descricao, serviceLine, area, nivelId, 
            pontos, hasValidade, tipoValidade, valorValidade, adminId, requisitos 
        } = req.body;

        // 1. Obter configurações do sistema
        let validadeMeses = 12;
        let pontosFinal = pontos ? parseInt(pontos) : null;
        
        try {
            const config = await ConfiguracoesSistema.findByPk(1);
            if (config) {
                validadeMeses = config.VALIDADE_MESES_PADRAO || 12;
                if (!pontosFinal) {
                    if (nivelId === 1) pontosFinal = config.PONTOS_DEFAULT_A;
                    else if (nivelId === 2) pontosFinal = config.PONTOS_DEFAULT_B;
                    else if (nivelId === 3) pontosFinal = config.PONTOS_DEFAULT_C;
                    else if (nivelId === 4) pontosFinal = config.PONTOS_DEFAULT_D;
                    else if (nivelId === 5) pontosFinal = config.PONTOS_DEFAULT_E;
                    else pontosFinal = 150;
                }
            }
        } catch(e) { console.error("Erro ao ler Configurações:", e); }

        if (!pontosFinal) pontosFinal = 150; // Fallback
        if (pontosFinal > 500) pontosFinal = 500; // Máximo 500
        // 2. Criar o Badge
        let urlImagemFinal = '/uploads/default-trophy.png';
        if (req.body.imagemBase64 && req.body.imagemBase64.startsWith('data:image')) {
            const uploadedImage = await uploadDataUri(req, req.body.imagemBase64, {
                folder: 'softinsa/badges',
                resourceType: 'auto',
                originalname: nomeImagemBadge(req.body.imagemBase64)
            });
            urlImagemFinal = uploadedImage.url;
            console.log('[Badges] Imagem criada/atualizada no Cloudinary/local:', urlImagemFinal);
        }

        let valMeses = null;
        let valDias = null;

        if (hasValidade) {
            const v = parseInt(valorValidade) || validadeMeses;
            if (tipoValidade === 'dias') {
                valDias = v;
            } else {
                valMeses = v;
            }
        }

        const novoBadge = await Badge.create({
            ID_CATEGORIA: 1,
            ID_NIVEL: nivelId,
            ID_ADMIN: adminId,
            NOME_BADGE: nome,
            DESCRICAO_BADGE: descricao || '',
            CATEGORIA_BADGE: JSON.stringify({ serviceLine: serviceLine || 'Global', area: area || 'Global' }),
            PONTOS_BADGE: pontosFinal,
            URL_IMAGEM: urlImagemFinal,
            TEMPO_EXPIRACAO_BADGE: valDias,
            IS_PREMIUM: false,
            VALIDADE_MESES: valMeses,
            VALIDADE_EXPIRACAO: null
        });
        await LogAtividadeSistema.create({ ID_UTILIZADOR: req.userId || 1, TIPO_ATIVIDADE: 'Criação Badge', DETALHES_ATIVIDADE: `Criou novo Badge: ${nome}`, DATA_HORA_ATIVIDADE: new Date() });
        const todosUtils = await Utilizador.findAll({ where: { ESTADO_CONTA_UTILIZADOR: 'Ativo' } });
        for (const u of todosUtils) {
            const perfis = u.PERFIL_UTILIZADOR || '';
            const deveReceber = perfis.includes('Talent Manager') ||
                perfis.includes('Consultor') ||
                (perfis.includes('Service Line Leader') && u.SL_REGISTO === serviceLine);
            if (!deveReceber) continue;
            pushService.sendPush(
                u.ID_UTILIZADOR,
                'info',
                'Novo Badge Adicionado',
                `O badge ${nome} foi adicionado ao catálogo de ${serviceLine}.`,
                'badges',
                u.PERFIL_UTILIZADOR
            );
        }

        // 2. Criar os Requisitos Associados
        if (requisitos && requisitos.length > 0) {
            for (let i = 0; i < requisitos.length; i++) {
                const reqAtual = requisitos[i];
                await Requisito.create({
                    ID_BADGE: novoBadge.ID_BADGE,
                    ID_REQUISITO_PADRAO: reqAtual.dbId || null,
                    TITULO_REQUISITO: reqAtual.titulo || `Requisito ${i+1}`,
                    DESCRICAO_REQUISITO: reqAtual.desc || 'Sem descrição',
                    TIPO_REQUISITO: reqAtual.tipo || 'Ficheiro',
                    ORDEM_REQUISITO: i + 1
                });
            }
        }


        res.status(201).json({ success: true, data: novoBadge });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// 3. Submeter Candidatura (Criar Pedido e Evidências ou Atualizar Rascunho)
controllers.candidatar = async (req, res) => {
    try {
        const { idBadge, idUtilizador, termosAceites } = req.body;
        if (String(termosAceites) !== 'true') {
            return res.status(400).json({
                success: false,
                message: 'É necessário aceitar os termos e a política RGPD antes de submeter.'
            });
        }
        let todosFicheiros = [];
        try {
            if (req.body.todosFicheiros) {
                todosFicheiros = JSON.parse(req.body.todosFicheiros);
            }
        } catch(e) { console.error(e); }

        // Sem evidências não existe uma candidatura efetivamente iniciada.
        // Remove apenas rascunhos normais; pedidos devolvidos mantêm o histórico.
        if (todosFicheiros.length === 0) {
            const rascunhoExistente = await Pedido.findOne({
                where: {
                    ID_UTILIZADOR: idUtilizador,
                    ID_BADGE: idBadge,
                    ESTADO_PEDIDO: 'Rascunho'
                }
            });
            if (rascunhoExistente) {
                await Evidencia.destroy({ where: { ID_PEDIDO: rascunhoExistente.ID_PEDIDO } });
                await rascunhoExistente.destroy();
            }
            return res.json({ success: true, message: 'Sem evidências; nenhum rascunho criado.' });
        }
        
        let pedido = await Pedido.findOne({
            where: { 
                ID_UTILIZADOR: idUtilizador, 
                ID_BADGE: idBadge, 
                ESTADO_PEDIDO: { [Op.in]: ['Rascunho', 'Pendente de Correção'] } 
            }
        });

        let evidenciasExistentes = [];
        if (pedido) {
            evidenciasExistentes = await Evidencia.findAll({
                where: { ID_PEDIDO: pedido.ID_PEDIDO }
            });
            await pedido.update({
                ESTADO_PEDIDO: 'Pendente',
                DATA_SUBMISSAO_PEDIDO: new Date(),
                DATA_ULTIMA_ATUALIZACAO: new Date()
            });
            await Evidencia.destroy({ where: { ID_PEDIDO: pedido.ID_PEDIDO } });
        } else {
            pedido = await Pedido.create({
                ID_UTILIZADOR: idUtilizador,
                ID_BADGE: idBadge,
                DATA_SUBMISSAO_PEDIDO: new Date(),
                ESTADO_PEDIDO: 'Pendente',
                DATA_ULTIMA_ATUALIZACAO: new Date()
            });
        }

        if (todosFicheiros && todosFicheiros.length > 0) {
            for (const ev of todosFicheiros) {
                // Procurar o ficheiro real recebido pelo multer
                const evidenciaExistente = evidenciasExistentes.find(e => e.NOME_FICHEIRO === ev.nome);
                let savedUrl = evidenciaExistente?.URL_FICHEIRO || `/uploads/simulacao/${ev.nome}`;
                if (req.files && req.files.length > 0) {
                    const uploadedFile = req.files.find(f => ficheiroCorresponde(f, ev.nome));
                    if (uploadedFile) {
                        const uploaded = await uploadEvidenceMulterFile(req, uploadedFile, {
                            folder: 'softinsa/evidencias',
                            resourceType: 'auto'
                        });
                        savedUrl = uploaded.url;
                    }
                }

                await Evidencia.create({
                    ID_PEDIDO: pedido.ID_PEDIDO,
                    ID_REQUISITO: ev.idRequisito || null,
                    NOME_FICHEIRO: ev.nome,
                    REQUISITO_MAPEADO: ev.idRequisito ? `REQ-${ev.idRequisito}` : 'Não Mapeado',
                    URL_FICHEIRO: savedUrl
                });
            }
        }

        await LogAtividadeSistema.create({ ID_UTILIZADOR: idUtilizador, TIPO_ATIVIDADE: 'Candidatura Submetida', DETALHES_ATIVIDADE: `Submeteu a candidatura ao badge ${idBadge}`, DATA_HORA_ATIVIDADE: new Date() });

        const utilizador = await Utilizador.findByPk(idUtilizador);
        const badgeSubmetido = await Badge.findByPk(idBadge);
        const [preferencias] = await PreferenciasUtilizador.findOrCreate({
            where: { ID_UTILIZADOR: idUtilizador },
            defaults: {
                IDIOMA_APP: 'pt',
                RECEBER_EMAIL_PEDIDOS: true,
                RECEBER_PUSH_EXPIRACAO: true,
                EXIBIR_LINK_PUBLICO: true,
                TERMOS_RGPD: true
            }
        });
        if (!preferencias.TERMOS_RGPD) {
            await preferencias.update({ TERMOS_RGPD: true });
        }
        if (utilizador) {
            const nomeBadge = badgeSubmetido?.NOME_BADGE || `Badge ${idBadge}`;
            const mensagemConfirmacao = `A sua candidatura ao badge "${nomeBadge}" foi submetida por ${utilizador.NOME_COMPLETO_UTILIZADOR} e enviada para análise do Talent Manager. Mensagem: Sem mensagem adicional.`;
            pushService.sendPush(
                utilizador.ID_UTILIZADOR,
                'info',
                'Candidatura Enviada para o Talent Manager',
                mensagemConfirmacao,
                'pedidos',
                'Consultor'
            );
            try {
                mailer.sendEmail(
                    utilizador.EMAIL_UTILIZADOR,
                    'Confirmação de Candidatura - Plataforma de Badges Softinsa',
                    `<h2>Candidatura submetida com sucesso</h2>
                     <p>Olá, ${utilizador.NOME_COMPLETO_UTILIZADOR}.</p>
                     <p>${mensagemConfirmacao}</p>
                     <p>Pode acompanhar o estado em <strong>Pedidos → Histórico de Pedidos</strong>.</p>`,
                    'pedidos',
                    'Consultor'
                );
            } catch (mailErr) {
                console.error('Falha ao enviar email de confirmação da candidatura:', mailErr);
            }
        }

        // Os Talent Managers são validadores globais e devem receber o novo pedido.
        const talentManagers = await Utilizador.findAll({
            where: {
                ESTADO_CONTA_UTILIZADOR: 'Ativo',
                PERFIL_UTILIZADOR: { [Op.like]: '%Talent Manager%' }
            }
        });
        for (const talent of talentManagers) {
            const nomeConsultor = utilizador?.NOME_COMPLETO_UTILIZADOR || `Utilizador ${idUtilizador}`;
            const nomeBadge = badgeSubmetido?.NOME_BADGE || `Badge ${idBadge}`;
            const mensagemTalent = `${nomeConsultor} submeteu uma candidatura ao badge "${nomeBadge}". Mensagem: Sem mensagem adicional. Aceda a Validações → Pedidos Pendentes para analisar as evidências.`;
            pushService.sendPush(
                talent.ID_UTILIZADOR,
                'info',
                'Nova Candidatura para Validação',
                mensagemTalent,
                'pedidos',
                'Talent Manager'
            );
            try {
                mailer.sendEmail(
                    talent.EMAIL_UTILIZADOR,
                    'Nova Candidatura para Validação - Plataforma de Badges Softinsa',
                    `<h2>Nova candidatura recebida</h2>
                     <p>Olá, ${talent.NOME_COMPLETO_UTILIZADOR}.</p>
                     <p>${mensagemTalent}</p>`,
                    'pedidos',
                    'Talent Manager'
                );
            } catch (mailErr) {
                console.error('Falha ao enviar email de nova candidatura ao Talent Manager:', mailErr);
            }
        }
        res.status(201).json({ success: true, message: 'Candidatura submetida com sucesso!' });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// 4. Guardar Rascunho
controllers.saveRascunho = async (req, res) => {
    try {
        const { idBadge, idUtilizador } = req.body;
        let todosFicheiros = [];
        try {
            if (req.body.todosFicheiros) {
                if (typeof req.body.todosFicheiros === 'string') {
                    todosFicheiros = JSON.parse(req.body.todosFicheiros);
                } else {
                    todosFicheiros = req.body.todosFicheiros;
                }
            }
        } catch(e) { console.error(e); }

        if (todosFicheiros.length === 0) {
            const rascunhoExistente = await Pedido.findOne({
                where: {
                    ID_UTILIZADOR: idUtilizador,
                    ID_BADGE: idBadge,
                    ESTADO_PEDIDO: 'Rascunho'
                }
            });
            if (rascunhoExistente) {
                await Evidencia.destroy({ where: { ID_PEDIDO: rascunhoExistente.ID_PEDIDO } });
                await rascunhoExistente.destroy();
            }
            return res.json({ success: true, message: 'Sem evidências; nenhum rascunho criado.' });
        }
        
        let pedido = await Pedido.findOne({
            where: { 
                ID_UTILIZADOR: idUtilizador, 
                ID_BADGE: idBadge, 
                ESTADO_PEDIDO: { [Op.in]: ['Rascunho', 'Pendente de Correção'] }
            }
        });

        if (!pedido) {
            pedido = await Pedido.create({
                ID_UTILIZADOR: idUtilizador,
                ID_BADGE: idBadge,
                DATA_SUBMISSAO_PEDIDO: new Date(),
                ESTADO_PEDIDO: 'Rascunho',
                DATA_ULTIMA_ATUALIZACAO: new Date()
            });
        }

        const evidenciasExistentes = await Evidencia.findAll({
            where: { ID_PEDIDO: pedido.ID_PEDIDO }
        });
        await Evidencia.destroy({ where: { ID_PEDIDO: pedido.ID_PEDIDO } });

        if (todosFicheiros && todosFicheiros.length > 0) {
            for (const ev of todosFicheiros) {
                const evidenciaExistente = evidenciasExistentes.find(e => e.NOME_FICHEIRO === ev.nome);
                let savedUrl = evidenciaExistente?.URL_FICHEIRO || `/uploads/simulacao/${ev.nome}`;
                if (req.files && req.files.length > 0) {
                    const uploadedFile = req.files.find(f => ficheiroCorresponde(f, ev.nome));
                    if (uploadedFile) {
                        const uploaded = await uploadEvidenceMulterFile(req, uploadedFile, {
                            folder: 'softinsa/evidencias',
                            resourceType: 'auto'
                        });
                        savedUrl = uploaded.url;
                    }
                }

                await Evidencia.create({
                    ID_PEDIDO: pedido.ID_PEDIDO,
                    ID_REQUISITO: ev.idRequisito || null,
                    NOME_FICHEIRO: ev.nome,
                    REQUISITO_MAPEADO: ev.idRequisito ? `REQ-${ev.idRequisito}` : 'Não Mapeado',
                    URL_FICHEIRO: savedUrl
                });
            }
        }

        if (todosFicheiros.length > 0) {
            await LogAtividadeSistema.create({ ID_UTILIZADOR: idUtilizador, TIPO_ATIVIDADE: 'Evidências em Rascunho', DETALHES_ATIVIDADE: `Guardou ${todosFicheiros.length} evidência(s) no rascunho do badge ${idBadge}`, DATA_HORA_ATIVIDADE: new Date() });
        }
        res.json({ success: true, message: 'Rascunho guardado' });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// 5. Carregar Rascunho
controllers.getRascunho = async (req, res) => {
    try {
        const { idBadge, idUtilizador } = req.params;
        const pedido = await Pedido.findOne({
            where: { 
                ID_UTILIZADOR: idUtilizador, 
                ID_BADGE: idBadge, 
                ESTADO_PEDIDO: { [Op.in]: ['Rascunho', 'Pendente de Correção'] } 
            },
            include: [{ model: Evidencia }]
        });

        if (!pedido) return res.json({ success: true, data: null });

        res.json({ success: true, data: pedido });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// 4. Eliminar Badge
controllers.deleteBadge = async (req, res) => {
    try {
        const { id } = req.params;
        const ConsultorBadge = require('../models/ConsultorBadge');
        const Consultor = require('../models/Consultor');

        const badge = await Badge.findByPk(id);
        if (!badge) return res.status(404).json({ success: false, message: 'Badge não encontrado' });

        let categoria = {};
        try { categoria = JSON.parse(badge.CATEGORIA_BADGE || '{}'); } catch (_) {}

        const idsAfetados = new Set();
        const pedidosAfetados = await Pedido.findAll({ where: { ID_BADGE: id } });
        pedidosAfetados.forEach(p => idsAfetados.add(p.ID_UTILIZADOR));

        const consultorBadges = await ConsultorBadge.findAll({ where: { ID_BADGE: id } });
        for (const cb of consultorBadges) {
            const consultor = await Consultor.findByPk(cb.ID_CONSULTOR);
            if (consultor) {
                idsAfetados.add(consultor.ID_UTILIZADOR);
                consultor.PONTUACAO_TOTAL = Math.max(0, consultor.PONTUACAO_TOTAL - badge.PONTOS_BADGE);
                await consultor.save();
            }
        }

        const validadores = await Utilizador.findAll({ where: { ESTADO_CONTA_UTILIZADOR: 'Ativo' } });
        validadores.forEach(u => {
            const perfis = u.PERFIL_UTILIZADOR || '';
            if (perfis.includes('Talent Manager') ||
                (perfis.includes('Service Line Leader') && u.SL_REGISTO === categoria.serviceLine)) {
                idsAfetados.add(u.ID_UTILIZADOR);
            }
        });

        const idsPedidos = pedidosAfetados.map(p => p.ID_PEDIDO);
        if (idsPedidos.length > 0) {
            await Evidencia.destroy({ where: { ID_PEDIDO: { [Op.in]: idsPedidos } } });
            const relacoesHistorico = await RegistoHistoricoPedido.findAll({ where: { ID_PEDIDO: { [Op.in]: idsPedidos } } });
            const idsHistorico = relacoesHistorico.map(r => r.ID_HISTORICO);
            await RegistoHistoricoPedido.destroy({ where: { ID_PEDIDO: { [Op.in]: idsPedidos } } });
            if (idsHistorico.length > 0) await HistoricoPedido.destroy({ where: { ID_HISTORICO: { [Op.in]: idsHistorico } } });
            await Pedido.destroy({ where: { ID_PEDIDO: { [Op.in]: idsPedidos } } });
        }
        await ConsultorBadge.destroy({ where: { ID_BADGE: id } });
        await Requisito.destroy({ where: { ID_BADGE: id } });
        await badge.destroy();

        for (const idUtilizador of idsAfetados) {
            const destinatario = validadores.find(u => u.ID_UTILIZADOR === idUtilizador) || await Utilizador.findByPk(idUtilizador);
            if (destinatario) {
                pushService.sendPush(idUtilizador, 'warning', 'Badge Eliminado', `O badge "${badge.NOME_BADGE}" foi eliminado da plataforma.`, 'badges', destinatario.PERFIL_UTILIZADOR);
            }
        }
        await LogAtividadeSistema.create({ ID_UTILIZADOR: req.userId || 1, TIPO_ATIVIDADE: 'Eliminação Badge', DETALHES_ATIVIDADE: `Eliminou o Badge: ${badge.NOME_BADGE}`, DATA_HORA_ATIVIDADE: new Date() });

        res.json({ success: true, message: 'Badge eliminado com sucesso' });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// 5. Update Badge
controllers.updateBadge = async (req, res) => {
    try {
        const { id } = req.params;
        const { nome, descricao, serviceLine, area, nivelId, pontos, hasValidade, tipoValidade, valorValidade, requisitos, adminId } = req.body;

        const Badge = require('../models/Badge');
        const Requisito = require('../models/Requisito');
        const ConsultorBadge = require('../models/ConsultorBadge');
        const Consultor = require('../models/Consultor');

        const badge = await Badge.findByPk(id);
        if (!badge) return res.status(404).json({ success: false, message: 'Badge não encontrado' });

        const diffPontos = pontos - badge.PONTOS_BADGE;
        // Update badge image if provided
        let urlImagemFinal = badge.URL_IMAGEM;
        if (req.body.imagemBase64 && req.body.imagemBase64.startsWith('data:image')) {
            const uploadedImage = await uploadDataUri(req, req.body.imagemBase64, {
                folder: 'softinsa/badges',
                resourceType: 'auto',
                originalname: nomeImagemBadge(req.body.imagemBase64)
            });
            urlImagemFinal = uploadedImage.url;
            console.log('[Badges] Imagem atualizada no Cloudinary/local:', urlImagemFinal);
        } else {
            console.log('[Badges] PUT sem imagemBase64 nova. Mantem imagem atual:', urlImagemFinal);
        }

        // Update badge
        badge.NOME_BADGE = nome;
        badge.DESCRICAO_BADGE = descricao;
        badge.CATEGORIA_BADGE = JSON.stringify({ serviceLine: serviceLine || 'Global', area: area || 'Global' });
        badge.ID_NIVEL = nivelId;
        badge.PONTOS_BADGE = pontos;
        badge.URL_IMAGEM = urlImagemFinal;
        const config = await ConfiguracoesSistema.findByPk(1);
        const validadePadrao = config?.VALIDADE_MESES_PADRAO || 12;

        let valMeses = null;
        let valDias = null;

        if (hasValidade) {
            const v = parseInt(valorValidade) || validadePadrao;
            if (tipoValidade === 'dias') {
                valDias = v;
            } else {
                valMeses = v;
            }
        }

        badge.VALIDADE_MESES = valMeses;
        badge.TEMPO_EXPIRACAO_BADGE = valDias;
        badge.VALIDADE_EXPIRACAO = null;
        await badge.save();
        console.log('[Badges] URL_IMAGEM final guardado:', badge.URL_IMAGEM);

        // Update pontos dos consultores se mudou
        if (diffPontos !== 0) {
            const consultorBadges = await ConsultorBadge.findAll({ where: { ID_BADGE: id } });
            for (let cb of consultorBadges) {
                const consultor = await Consultor.findByPk(cb.ID_CONSULTOR);
                if (consultor) {
                    consultor.PONTUACAO_TOTAL = Math.max(0, consultor.PONTUACAO_TOTAL + diffPontos);
                    await consultor.save();
                }
            }
        }

        // Handle Requisitos: Delete all and recreate
        await Requisito.destroy({ where: { ID_BADGE: id } });
        if (requisitos && requisitos.length > 0) {
            for (let [i, reqData] of requisitos.entries()) {
                await Requisito.create({
                    TITULO_REQUISITO: reqData.titulo || '',
                    DESCRICAO_REQUISITO: reqData.desc || '',
                    ID_BADGE: badge.ID_BADGE,
                    TIPO_REQUISITO: reqData.tipo || 'Ficheiro',
                    ID_REQUISITO_PADRAO: reqData.dbId || null,
                    ORDEM_REQUISITO: reqData.ordem || i + 1
                });
            }
        }

        // Optional Log
        const LogAtividadeSistema = require('../models/LogAtividadeSistema');
        if (adminId) {
            await LogAtividadeSistema.create({
                ID_UTILIZADOR: adminId,
                TIPO_ATIVIDADE: 'Edição de Badge',
                DETALHES_ATIVIDADE: `Badge atualizado: ${nome}`,
                DATA_HORA_ATIVIDADE: new Date()
            });
        }

        res.json({ success: true, message: 'Badge atualizado com sucesso!', data: badge });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

module.exports = controllers;
