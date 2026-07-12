const LearningPath = require('../models/LearningPath');
const LogAtividadeSistema = require('../models/LogAtividadeSistema');
const ServiceLine = require('../models/ServiceLine');
const Area = require('../models/Area');
const Nivel = require('../models/Nivel');
const RequisitoPadrao = require('../models/RequisitoPadrao');
const ServiceLineLearningPath = require('../models/ServiceLineLearningPath');
const Badge = require('../models/Badge');

const controllers = {};

// GET /estrutura - Retorna tudo para popular o frontend
controllers.getEstruturaCompleta = async (req, res) => {
    try {
        const lps = await LearningPath.findAll();
        
        // As Service Lines originais não trazem diretamente o LP via belongsTo nas migrations normais, 
        // mas podemos ir buscar à tabela de intersecção
        const slsRaw = await ServiceLine.findAll();
        const sllp = await ServiceLineLearningPath.findAll();
        
        const sls = slsRaw.map(sl => {
            const rel = sllp.find(r => r.ID_SERVICE_LINE === sl.ID_SERVICE_LINE);
            return {
                id: sl.ID_SERVICE_LINE,
                lpId: rel ? rel.ID_LEARNING_PATH : null,
                nome: sl.NOME_SERVICE_LINE,
                desc: sl.DESCRICAO_SERVICE_LINE
            };
        });

        const areasRaw = await Area.findAll({
            include: [
                {
                    model: Nivel,
                    include: [RequisitoPadrao]
                }
            ]
        });

        const areas = areasRaw.map(a => {
            const niveisAtivos = [];
            const niveisIds = {};
            const requisitos = [];
            let sortedNiveis = [];
            
            if (a.Nivels) {
                // Ensure levels are sorted by ORDEM_HIERARQUICA
                sortedNiveis = [...a.Nivels].sort((n1, n2) => n1.ORDEM_HIERARQUICA - n2.ORDEM_HIERARQUICA);
                sortedNiveis.forEach(n => {
                    const letraNivel = String.fromCharCode(64 + n.ORDEM_HIERARQUICA);
                    niveisAtivos.push(n.NOME_NIVEL);
                    niveisIds[n.NOME_NIVEL] = n.ID_NIVEL;
                    if (n.RequisitoPadraos) {
                        // Ensure requirements are sorted by ID so they appear in creation order (A1, A2...)
                        const sortedReqs = [...n.RequisitoPadraos].sort((r1, r2) => r1.ID_REQUISITO_PADRAO - r2.ID_REQUISITO_PADRAO);
                        sortedReqs.forEach(req => {
                            requisitos.push({
                                id: `${letraNivel}${req.ID_REQUISITO_PADRAO}`, // Apenas p/ manter formato do frontend
                                dbId: req.ID_REQUISITO_PADRAO,
                                nivelId: n.ID_NIVEL,
                                desc: req.DESCRICAO_PADRAO,
                                nivel: n.NOME_NIVEL,
                                letra: letraNivel
                            });
                        });
                    }
                });
            }

            return {
                id: a.ID_AREA,
                slId: a.ID_SERVICE_LINE,
                nome: a.NOME_AREA,
                niveisAtivos: niveisAtivos,
                niveisIds: niveisIds,
                requisitos: requisitos,
                _niveisDB: sortedNiveis // para usarmos internamente no adicionarRequisito
            };
        });

        const lpsFormatted = lps.map(lp => ({
            id: lp.ID_LEARNING_PATH,
            nome: lp.NOME_LEARNING_PATH,
            desc: lp.DESCRICAO_LEARNING_PATH
        }));

        res.json({
            success: true,
            data: {
                learningPaths: lpsFormatted,
                serviceLines: sls,
                areas: areas
            }
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: error.message });
    }
};

// POST /estrutura/learning-path
controllers.criarLearningPath = async (req, res) => {
    try {
        const { nome, desc, adminId } = req.body;
        const novo = await LearningPath.create({
            ID_ADMIN: adminId,
            NOME_LEARNING_PATH: nome,
            DESCRICAO_LEARNING_PATH: desc || '',
            ESTADO_ATIVO_LEARNING_PATH: true,
            DATA_CRIACAO_LEARNING_PATH: new Date()
        });
        await LogAtividadeSistema.create({ ID_UTILIZADOR: req.userId || 1, TIPO_ATIVIDADE: 'Criação Learning Path', DETALHES_ATIVIDADE: `Criou novo Learning Path: ${nome}`, DATA_HORA_ATIVIDADE: new Date() });
        res.json({ success: true, data: novo });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// POST /estrutura/service-line
controllers.criarServiceLine = async (req, res) => {
    try {
        const { nome, desc, lpId, adminId } = req.body;
        const novo = await ServiceLine.create({
            ID_ADMIN: adminId,
            NOME_SERVICE_LINE: nome,
            DESCRICAO_SERVICE_LINE: desc || '',
            ESTADO_ATIVO_SERVICE_LINE: true
        });
        await LogAtividadeSistema.create({ ID_UTILIZADOR: req.userId || 1, TIPO_ATIVIDADE: 'Criação Service Line', DETALHES_ATIVIDADE: `Criou nova Service Line: ${nome}`, DATA_HORA_ATIVIDADE: new Date() });

        if (lpId) {
            await ServiceLineLearningPath.create({
                ID_LEARNING_PATH: lpId,
                ID_SERVICE_LINE: novo.ID_SERVICE_LINE
            });
        }

        res.json({ success: true, data: novo });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// POST /estrutura/area
controllers.criarArea = async (req, res) => {
    try {
        const { nome, slId, userId } = req.body;
        const nova = await Area.create({
            ID_UTILIZADOR: userId,
            ID_SERVICE_LINE: slId,
            NOME_AREA: nome,
            DESCRICAO_AREA: ''
        });
        await LogAtividadeSistema.create({ ID_UTILIZADOR: req.userId || 1, TIPO_ATIVIDADE: 'Criação Área', DETALHES_ATIVIDADE: `Criou nova Área: ${nome}`, DATA_HORA_ATIVIDADE: new Date() });
        res.json({ success: true, data: nova });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// POST /estrutura/area/:id/nivel
controllers.adicionarNivelArea = async (req, res) => {
    try {
        const { id } = req.params; // id da área
        const { nivelNome } = req.body;

        const area = await Area.findByPk(id, { include: [Nivel] });
        let ordem = 1;
        if (area && area.Nivels && area.Nivels.length > 0) {
            const maxOrdem = Math.max(...area.Nivels.map(n => n.ORDEM_HIERARQUICA));
            ordem = maxOrdem + 1;
        }

        const novo = await Nivel.create({
            ID_AREA: id,
            NOME_NIVEL: nivelNome,
            ORDEM_HIERARQUICA: ordem,
            DESCRICAO_NIVEL: 'Nível ' + nivelNome
        });

        res.json({ success: true, data: novo });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// POST /estrutura/requisito
controllers.adicionarRequisito = async (req, res) => {
    try {
        const { nivelId, descricao, titulo } = req.body;
        const novo = await RequisitoPadrao.create({
            ID_NIVEL: nivelId,
            TITULO_PADRAO: titulo || 'Requisito Padrão',
            DESCRICAO_PADRAO: descricao,
            TIPO_REQUISITO_PADRAO: 'Ficheiro',
            CODIGO_REFERENCIA: 'REQ-' + Date.now()
        });

        res.json({ success: true, data: novo });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// DELETE /estrutura/requisito/:id
controllers.eliminarRequisito = async (req, res) => {
    try {
        const { id } = req.params;
        await RequisitoPadrao.destroy({ where: { ID_REQUISITO_PADRAO: id } });
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// DELETE /estrutura/area/:id/nivel
// Apaga o nível mais alto (última letra) dessa área
controllers.eliminarNivelMaisAlto = async (req, res) => {
    try {
        const { id } = req.params;
        
        // Encontra todos os níveis da área para achar o mais alto
        const niveis = await Nivel.findAll({ where: { ID_AREA: id } });
        if(niveis.length === 0) return res.json({ success: true, message: "Nenhum nível para apagar" });
        
        // O mais alto tem a maior ORDEM_HIERARQUICA ou a última letra
        const nivelMaisAlto = niveis.reduce((prev, current) => (prev.ORDEM_HIERARQUICA > current.ORDEM_HIERARQUICA) ? prev : current);

        const badgesAssociados = await Badge.count({ where: { ID_NIVEL: nivelMaisAlto.ID_NIVEL } });
        if (badgesAssociados > 0) {
            return res.status(400).json({
                success: false,
                message: `Não é possível eliminar o nível "${nivelMaisAlto.NOME_NIVEL}" porque existem ${badgesAssociados} badge(s) associados a este nível. Elimine ou mova esses badges antes de apagar o nível.`
            });
        }
        
        // Apaga primeiro os requisitos desse nível para não dar erro de foreign key
        await RequisitoPadrao.destroy({ where: { ID_NIVEL: nivelMaisAlto.ID_NIVEL } });
        
        // Agora apaga o nível
        await Nivel.destroy({ where: { ID_NIVEL: nivelMaisAlto.ID_NIVEL } });
        
        res.json({ success: true, data: nivelMaisAlto.NOME_NIVEL });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// DELETE /estrutura/learning-path/:id
controllers.eliminarLearningPath = async (req, res) => {
    try {
        const { id } = req.params;
        const relacoes = await ServiceLineLearningPath.count({ where: { ID_LEARNING_PATH: id } });
        if (relacoes > 0) {
            return res.json({ success: false, message: 'Não é possível eliminar um Learning Path que possui Service Lines associadas. Limpe as dependências primeiro.' });
        }
        await LearningPath.destroy({ where: { ID_LEARNING_PATH: id } });
        await LogAtividadeSistema.create({ ID_UTILIZADOR: req.userId || 1, TIPO_ATIVIDADE: 'Eliminação Learning Path', DETALHES_ATIVIDADE: `Eliminou Learning Path ID: ${id}`, DATA_HORA_ATIVIDADE: new Date() });
        res.json({ success: true, message: 'Learning Path eliminado com sucesso.' });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// DELETE /estrutura/service-line/:id
controllers.eliminarServiceLine = async (req, res) => {
    try {
        const { id } = req.params;
        const areasCount = await Area.count({ where: { ID_SERVICE_LINE: id } });
        if (areasCount > 0) {
            return res.json({ success: false, message: 'Não é possível eliminar uma Service Line que possui Áreas associadas. Limpe as dependências primeiro.' });
        }
        await ServiceLineLearningPath.destroy({ where: { ID_SERVICE_LINE: id } });
        await ServiceLine.destroy({ where: { ID_SERVICE_LINE: id } });
        await LogAtividadeSistema.create({ ID_UTILIZADOR: req.userId || 1, TIPO_ATIVIDADE: 'Eliminação Service Line', DETALHES_ATIVIDADE: `Eliminou Service Line ID: ${id}`, DATA_HORA_ATIVIDADE: new Date() });
        res.json({ success: true, message: 'Service Line eliminada com sucesso.' });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// DELETE /estrutura/area/:id
controllers.eliminarArea = async (req, res) => {
    try {
        const { id } = req.params;
        const niveisCount = await Nivel.count({ where: { ID_AREA: id } });
        if (niveisCount > 0) {
            return res.json({ success: false, message: 'Não é possível eliminar uma Área que possui Níveis ativos. Remova todos os níveis primeiro.' });
        }
        await Area.destroy({ where: { ID_AREA: id } });
        await LogAtividadeSistema.create({ ID_UTILIZADOR: req.userId || 1, TIPO_ATIVIDADE: 'Eliminação Área', DETALHES_ATIVIDADE: `Eliminou Área ID: ${id}`, DATA_HORA_ATIVIDADE: new Date() });
        res.json({ success: true, message: 'Área eliminada com sucesso.' });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// PUT /estrutura/learning-path/:id
controllers.editarLearningPath = async (req, res) => {
    try {
        const { id } = req.params;
        const { nome, desc } = req.body;
        await LearningPath.update({
            NOME_LEARNING_PATH: nome,
            DESCRICAO_LEARNING_PATH: desc
        }, { where: { ID_LEARNING_PATH: id } });
        res.json({ success: true, message: 'Learning Path atualizado com sucesso.' });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// PUT /estrutura/service-line/:id
controllers.editarServiceLine = async (req, res) => {
    try {
        const { id } = req.params;
        const { nome, desc, lpId } = req.body;
        
        await ServiceLine.update({
            NOME_SERVICE_LINE: nome,
            DESCRICAO_SERVICE_LINE: desc
        }, { where: { ID_SERVICE_LINE: id } });

        if (lpId) {
            // Check if rel exists, if so update, else create
            const existingRel = await ServiceLineLearningPath.findOne({ where: { ID_SERVICE_LINE: id } });
            if (existingRel) {
                await ServiceLineLearningPath.update({ ID_LEARNING_PATH: lpId }, { where: { ID_SERVICE_LINE: id } });
            } else {
                await ServiceLineLearningPath.create({ ID_LEARNING_PATH: lpId, ID_SERVICE_LINE: id });
            }
        }

        res.json({ success: true, message: 'Service Line atualizada com sucesso.' });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// PUT /estrutura/area/:id
controllers.editarArea = async (req, res) => {
    try {
        const { id } = req.params;
        const { nome, slId } = req.body;
        await Area.update({
            NOME_AREA: nome,
            ID_SERVICE_LINE: slId
        }, { where: { ID_AREA: id } });
        res.json({ success: true, message: 'Área atualizada com sucesso.' });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

module.exports = controllers;
