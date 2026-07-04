const fs = require('fs');
const path = require('path');
const sequelize = require('./config/database');

// Carrega todos os modelos e respetivas associações antes do sync.
const modelsPath = path.join(__dirname, 'models');
fs.readdirSync(modelsPath).forEach(file => {
  if (file.endsWith('.js') && file !== 'associacoes.js') {
    require(path.join(modelsPath, file));
  }
});

const {
  Utilizador,
  Administrador,
  TalentManager,
  ServiceLineLeader,
  Consultor,
  LearningPath,
  ServiceLine,
  Area,
  Nivel,
  Badge,
  Requisito,
  RequisitoPadrao,
  MarcoConquista,
  MarcoConsultor,
  ServiceLineLearningPath,
  Pedido,
  Evidencia,
  ConsultorBadge,
  HistoricoPontuacao,
  HistoricoPedido,
  RegistoHistoricoPedido,
  Notificacao,
  AvisoGeral,
  ConfiguracoesSistema,
  PreferenciasUtilizador,
  ObjetivoTimeline,
  LogAtividadeSistema,
  EstatisticasAcesso
} = sequelize.models;

const PASSWORD_TESTE = 'Softinsa@2026';
const IMAGEM_BADGE = '/uploads/default-trophy.png';
const hoje = new Date();

const niveisBase = [
  { letra: 'A', nome: 'Júnior', ordem: 1, pontos: 150 },
  { letra: 'B', nome: 'Intermédio', ordem: 2, pontos: 200 },
  { letra: 'C', nome: 'Sénior', ordem: 3, pontos: 250 },
  { letra: 'D', nome: 'Especialista', ordem: 4, pontos: 350 },
  { letra: 'E', nome: 'Líder de Conhecimento', ordem: 5, pontos: 500 }
];

const estruturaBase = [
  {
    chave: 'lowcode',
    serviceLine: 'Hybrid Cloud',
    descricaoSL: 'Serviços cloud, modernização aplicacional e plataformas low-code.',
    area: 'LowCode (Outsystems)',
    descricaoArea: 'Desenvolvimento e manutenção de soluções empresariais em OutSystems.',
    prefixoBadge: 'OutSystems',
    requisitos: {
      A: [
        ['Formação Base OutSystems', 'Concluir a formação introdutória oficial de OutSystems.'],
        ['Certificação Associate', 'Apresentar evidência de preparação ou certificação Associate Reactive Developer.']
      ]
    }
  },
  {
    chave: 'devops',
    serviceLine: 'Application Operations',
    descricaoSL: 'Operação aplicacional, automação, DevSecOps e melhoria contínua.',
    area: 'DevSecOps & IT Automation – DevOps',
    descricaoArea: 'Práticas de CI/CD, infraestrutura como código, observabilidade e segurança.',
    prefixoBadge: 'DevSecOps & Automation',
    requisitos: {
      B: [
        ['Automação CI/CD', 'Demonstrar a construção e utilização de um pipeline CI/CD.']
      ],
      D: [
        ['Arquitetura DevSecOps', 'Apresentar uma solução de referência com segurança integrada no ciclo DevOps.']
      ]
    }
  },
  {
    chave: 'talent',
    serviceLine: 'Sourcing & Talent Management',
    descricaoSL: 'Atração, desenvolvimento, acompanhamento e retenção de talento.',
    area: 'Sourcing & Talent Management - Talent Managem',
    descricaoArea: 'Competências de sourcing, recrutamento, desenvolvimento e gestão de talento.',
    prefixoBadge: 'Talent Management',
    requisitos: {
      A: [
        ['Fundamentos de Talent Management', 'Concluir uma formação introdutória em gestão de talento.']
      ],
      C: [
        ['Plano de Desenvolvimento', 'Apresentar um plano de desenvolvimento profissional aplicado.']
      ],
      E: [
        ['Mentoria Organizacional', 'Comprovar a liderança de uma iniciativa de mentoria ou desenvolvimento de talento.']
      ]
    }
  }
];

const nomesBadgePorNivel = {
  A: 'Fundamentos Júnior',
  B: 'Profissional Intermédio',
  C: 'Sénior',
  D: 'Especialista',
  E: 'Líder de Conhecimento'
};

const diasAtras = dias => {
  const data = new Date(hoje);
  data.setDate(data.getDate() - dias);
  return data;
};

const adicionarDias = (dataBase, dias) => {
  const data = new Date(dataBase);
  data.setDate(data.getDate() + dias);
  return data;
};

const adicionarMeses = (dataBase, meses) => {
  const data = new Date(dataBase);
  data.setMonth(data.getMonth() + meses);
  return data;
};

const categoriaBadge = item => JSON.stringify({
  serviceLine: item.serviceLine,
  area: item.area
});

const garantirFicheirosSeed = () => {
  const pasta = path.join(__dirname, '../uploads');
  fs.mkdirSync(pasta, { recursive: true });
  const ficheiros = {
    'seed-certificado-a1.txt': 'Evidência de demonstração para o requisito A1.',
    'seed-certificado-a2.txt': 'Evidência de demonstração para o requisito A2.',
    'seed-projeto-pratico.txt': 'Descrição do projeto prático usado como evidência.',
    'seed-pipeline-devops.txt': 'Evidência de pipeline DevOps para dados de demonstração.'
  };
  Object.entries(ficheiros).forEach(([nome, conteudo]) => {
    const destino = path.join(pasta, nome);
    if (!fs.existsSync(destino)) fs.writeFileSync(destino, conteudo, 'utf8');
  });
  return Object.keys(ficheiros).map(nome => `/uploads/${nome}`);
};

const criarUtilizador = async ({
  nome,
  email,
  perfis,
  adminId,
  serviceLine = null,
  area = null
}) => Utilizador.create({
  ID_ADMIN: adminId,
  NOME_COMPLETO_UTILIZADOR: nome,
  EMAIL_UTILIZADOR: email,
  PASSWORD_UTILIZADOR: PASSWORD_TESTE,
  PERFIL_UTILIZADOR: perfis.join(' / '),
  ESTADO_CONTA_UTILIZADOR: 'Ativo',
  DATA_REGISTO_UTILIZADOR: diasAtras(180),
  IS_PRIMEIRO_ACESSO: false,
  SL_REGISTO: serviceLine,
  AREA_REGISTO: area
});

const criarPreferencia = utilizador => PreferenciasUtilizador.create({
  ID_UTILIZADOR: utilizador.ID_UTILIZADOR,
  IDIOMA_APP: 'pt',
  RECEBER_EMAIL_PEDIDOS: true,
  RECEBER_PUSH_EXPIRACAO: true,
  EXIBIR_LINK_PUBLICO: true,
  TERMOS_RGPD: true
});

const criarPassoHistorico = async ({
  pedido,
  utilizador,
  data,
  estado,
  acao,
  perfil,
  resultado,
  comentario = null
}) => {
  const historico = await HistoricoPedido.create({
    ID_UTILIZADOR: utilizador.ID_UTILIZADOR,
    DATA_REGISTO_PEDIDO: data,
    ESTADO_ATUAL_PEDIDO: estado,
    TIPO_ACAO: acao,
    COMENTARIO_VALIDADOR: comentario,
    PERFIL_DECISOR: perfil,
    STATUS_RESULTADO: resultado
  });
  await RegistoHistoricoPedido.create({
    ID_PEDIDO: pedido.ID_PEDIDO,
    ID_HISTORICO: historico.ID_HISTORICO
  });
};

const criarPedidoAceite = async ({
  consultor,
  utilizadorConsultor,
  badge,
  talentManager,
  serviceLineLeader,
  dataSubmissao,
  ficheirosEvidencia
}) => {
  const dataTM = adicionarDias(dataSubmissao, 2);
  const dataSLL = adicionarDias(dataSubmissao, 4);
  const pedido = await Pedido.create({
    ID_UTILIZADOR: utilizadorConsultor.ID_UTILIZADOR,
    ID_TM: talentManager.ID_UTILIZADOR,
    ID_SLL: serviceLineLeader.ID_UTILIZADOR,
    ID_BADGE: badge.ID_BADGE,
    DATA_SUBMISSAO_PEDIDO: dataSubmissao,
    ESTADO_PEDIDO: 'Aceite',
    COMENTARIO_CONSULTOR: 'Candidatura de demonstração com evidências completas.',
    DATA_ULTIMA_ATUALIZACAO: dataSLL
  });

  const requisitos = await Requisito.findAll({
    where: { ID_BADGE: badge.ID_BADGE },
    order: [['ORDEM_REQUISITO', 'ASC']]
  });
  for (let index = 0; index < requisitos.length; index += 1) {
    const requisito = requisitos[index];
    const url = ficheirosEvidencia[index % ficheirosEvidencia.length];
    await Evidencia.create({
      ID_PEDIDO: pedido.ID_PEDIDO,
      ID_REQUISITO: requisito.ID_REQUISITO,
      NOME_FICHEIRO: path.basename(url),
      REQUISITO_MAPEADO: `REQ-${requisito.ID_REQUISITO}`,
      URL_FICHEIRO: url
    });
  }

  await criarPassoHistorico({
    pedido,
    utilizador: utilizadorConsultor,
    data: dataSubmissao,
    estado: 'Pendente',
    acao: 'Submeteu a candidatura',
    perfil: 'Consultor',
    resultado: 'pending'
  });
  await criarPassoHistorico({
    pedido,
    utilizador: talentManager,
    data: dataTM,
    estado: 'Em Análise SLL',
    acao: 'Validou as evidências e enviou para o SLL',
    perfil: 'Talent Manager',
    resultado: 'success',
    comentario: 'Evidências completas e conformes.'
  });
  await criarPassoHistorico({
    pedido,
    utilizador: serviceLineLeader,
    data: dataSLL,
    estado: 'Aceite',
    acao: 'Aprovou o pedido',
    perfil: 'Service Line Leader',
    resultado: 'success',
    comentario: 'Competências confirmadas para este nível.'
  });

  await ConsultorBadge.create({
    ID_CONSULTOR: consultor.ID_CONSULTOR,
    ID_BADGE: badge.ID_BADGE,
    DATA_ATRIBUICAO_BADGE: dataSLL,
    MOTIVO_ATRIBUICAO: 'Aprovação do Talent Manager e do Service Line Leader',
    DATA_EXPIRACAO: badge.VALIDADE_MESES ? adicionarMeses(dataSLL, badge.VALIDADE_MESES) : null,
    LINK_UNICO_BADGE: `seed-badge-${consultor.ID_CONSULTOR}-${badge.ID_BADGE}`,
    STATUS_GALERIA_PUBLICA: true
  });
  await HistoricoPontuacao.create({
    ID_UTILIZADOR: utilizadorConsultor.ID_UTILIZADOR,
    DATA_ATRIBUICAO: dataSLL,
    PONTOS_OBTIDOS: badge.PONTOS_BADGE,
    ORIGEM_PONTOS: `Aprovação do Badge: ${badge.NOME_BADGE}`
  });
  await Notificacao.create({
    ID_UTILIZADOR: utilizadorConsultor.ID_UTILIZADOR,
    TITULO_NOTIFICACAO: 'Badge atribuído',
    MENSAGEM_NOTIFICACAO: `O badge "${badge.NOME_BADGE}" foi aprovado e já está disponível.`,
    DATA_ENVIO_NOTIFICACAO: dataSLL,
    ESTADO_LIDO: true,
    TIPO_NOTIFICACAO: 'accepted'
  });
  return pedido;
};

const atribuirBadgeDireto = async ({ consultor, utilizador, badge, dias }) => {
  const data = diasAtras(dias);
  await ConsultorBadge.create({
    ID_CONSULTOR: consultor.ID_CONSULTOR,
    ID_BADGE: badge.ID_BADGE,
    DATA_ATRIBUICAO_BADGE: data,
    MOTIVO_ATRIBUICAO: 'Competência reconhecida na migração inicial',
    DATA_EXPIRACAO: badge.VALIDADE_MESES ? adicionarMeses(data, badge.VALIDADE_MESES) : null,
    LINK_UNICO_BADGE: `seed-migracao-${consultor.ID_CONSULTOR}-${badge.ID_BADGE}`,
    STATUS_GALERIA_PUBLICA: true
  });
  await HistoricoPontuacao.create({
    ID_UTILIZADOR: utilizador.ID_UTILIZADOR,
    DATA_ATRIBUICAO: data,
    PONTOS_OBTIDOS: badge.PONTOS_BADGE,
    ORIGEM_PONTOS: `Migração do Badge: ${badge.NOME_BADGE}`
  });
};

async function seedDatabase() {
  try {
    console.log('A recriar a base de dados com dados de demonstração coerentes...');
    await sequelize.sync({ force: true });
    const ficheirosEvidencia = garantirFicheirosSeed();

    // O administrador é criado primeiro porque a estrutura e os badges exigem ID_ADMIN.
    const adminUser = await criarUtilizador({
      nome: 'Administrador Softinsa',
      email: 'admin@softinsa.pt',
      perfis: ['Administrador'],
      adminId: null
    });
    const admin = await Administrador.create({
      ID_UTILIZADOR: adminUser.ID_UTILIZADOR,
      DATA_REGISTO_PLATAFORMA: diasAtras(365)
    });
    await adminUser.update({ ID_ADMIN: admin.ID_ADMIN });

    await ConfiguracoesSistema.create({
      ID_CONFIG: 1,
      MODO_MANUTENCAO: false,
      PONTOS_DEFAULT_A: 150,
      PONTOS_DEFAULT_B: 200,
      PONTOS_DEFAULT_C: 250,
      PONTOS_DEFAULT_D: 350,
      PONTOS_DEFAULT_E: 500,
      PONTOS_DEFAULT_OUTRO: 750,
      VALIDADE_MESES_PADRAO: 24,
      IDIOMA_PADRAO: 'Português (Portugal)',
      SESSAO_EXPIRACAO: '1 Hora',
      RETENCAO_EVIDENCIAS: '5 Anos (Recomendado)',
      GLOBAL_EMAIL: true,
      GLOBAL_PUSH: true,
      RGPD_TERMOS: 'Aceito que as evidências submetidas sejam tratadas para validação das minhas competências.',
      RGPD_POLITICAS: 'Os dados são usados exclusivamente no contexto da Plataforma de Badges da Softinsa.',
      RGPD_CONSENTIMENTOS: 'Publicação de badges e utilização de evidências para validação.'
    });

    // 1. Learning Path.
    const learningPath = await LearningPath.create({
      ID_ADMIN: admin.ID_ADMIN,
      NOME_LEARNING_PATH: 'Jornada Técnica',
      DESCRICAO_LEARNING_PATH: 'Percurso técnico da Softinsa organizado por Service Lines, áreas e níveis de competência.',
      DATA_CRIACAO_LEARNING_PATH: diasAtras(365),
      ESTADO_ATIVO_LEARNING_PATH: true
    });

    // 2. Service Lines, áreas e associação ao Learning Path.
    const contextos = {};
    for (const item of estruturaBase) {
      const serviceLine = await ServiceLine.create({
        ID_ADMIN: admin.ID_ADMIN,
        NOME_SERVICE_LINE: item.serviceLine,
        DESCRICAO_SERVICE_LINE: item.descricaoSL,
        ESTADO_ATIVO_SERVICE_LINE: true
      });
      await ServiceLineLearningPath.create({
        ID_LEARNING_PATH: learningPath.ID_LEARNING_PATH,
        ID_SERVICE_LINE: serviceLine.ID_SERVICE_LINE
      });
      const area = await Area.create({
        ID_UTILIZADOR: adminUser.ID_UTILIZADOR,
        ID_SERVICE_LINE: serviceLine.ID_SERVICE_LINE,
        NOME_AREA: item.area,
        DESCRICAO_AREA: item.descricaoArea
      });
      contextos[item.chave] = { item, serviceLine, area, niveis: {}, badges: {} };
    }

    // 3. Cinco níveis A-E por cada área.
    for (const contexto of Object.values(contextos)) {
      for (const nivelBase of niveisBase) {
        const nivel = await Nivel.create({
          ID_AREA: contexto.area.ID_AREA,
          NOME_NIVEL: nivelBase.nome,
          ORDEM_HIERARQUICA: nivelBase.ordem,
          DESCRICAO_NIVEL: `Nível ${nivelBase.letra} - ${nivelBase.nome} em ${contexto.area.NOME_AREA}.`
        });
        contexto.niveis[nivelBase.letra] = nivel;
      }
    }

    // 4. Requisitos padrão definidos ao nível da estrutura.
    const requisitosPadraoPorNivel = {};
    for (const contexto of Object.values(contextos)) {
      for (const [letra, requisitos] of Object.entries(contexto.item.requisitos)) {
        const chaveNivel = `${contexto.item.chave}-${letra}`;
        requisitosPadraoPorNivel[chaveNivel] = [];
        for (let index = 0; index < requisitos.length; index += 1) {
          const [titulo, descricao] = requisitos[index];
          const requisitoPadrao = await RequisitoPadrao.create({
            ID_NIVEL: contexto.niveis[letra].ID_NIVEL,
            TITULO_PADRAO: titulo,
            DESCRICAO_PADRAO: descricao,
            TIPO_REQUISITO_PADRAO: 'Ficheiro',
            CODIGO_REFERENCIA: `${contexto.item.chave.toUpperCase()}-${letra}${index + 1}`
          });
          requisitosPadraoPorNivel[chaveNivel].push(requisitoPadrao);
        }
      }
    }

    // 5. Um badge por cada nível de cada área: 3 x 5 = 15 badges.
    for (const contexto of Object.values(contextos)) {
      for (const nivelBase of niveisBase) {
        const validadeMeses = nivelBase.letra === 'E' ? null : (nivelBase.ordem <= 2 ? 24 : 36);
        const badge = await Badge.create({
          ID_CATEGORIA: contexto.area.ID_AREA,
          ID_NIVEL: contexto.niveis[nivelBase.letra].ID_NIVEL,
          ID_ADMIN: admin.ID_ADMIN,
          NOME_BADGE: `${contexto.item.prefixoBadge} - ${nomesBadgePorNivel[nivelBase.letra]}`,
          DESCRICAO_BADGE: `Certifica competências de nível ${nivelBase.nome} na área ${contexto.item.area}.`,
          CATEGORIA_BADGE: categoriaBadge(contexto.item),
          PONTOS_BADGE: nivelBase.pontos,
          URL_IMAGEM: IMAGEM_BADGE,
          TEMPO_EXPIRACAO_BADGE: validadeMeses ? validadeMeses * 30 : null,
          IS_PREMIUM: false,
          VALIDADE_MESES: validadeMeses,
          VALIDADE_EXPIRACAO: null
        });
        contexto.badges[nivelBase.letra] = badge;

        const chaveNivel = `${contexto.item.chave}-${nivelBase.letra}`;
        const padroes = requisitosPadraoPorNivel[chaveNivel] || [];
        for (let ordem = 1; ordem <= 3; ordem += 1) {
          const padrao = padroes[ordem - 1] || null;
          await Requisito.create({
            ID_BADGE: badge.ID_BADGE,
            ID_REQUISITO_PADRAO: padrao?.ID_REQUISITO_PADRAO || null,
            TITULO_REQUISITO: `Requisito ${nivelBase.letra}${ordem}`,
            DESCRICAO_REQUISITO: padrao?.DESCRICAO_PADRAO
              || `Submeter certificado, relatório ou outra evidência válida para o requisito ${nivelBase.letra}${ordem}.`,
            TIPO_REQUISITO: 'Ficheiro',
            ORDEM_REQUISITO: ordem
          });
        }
      }
    }

    // 6. Um badge premium por cada tipo de conquista suportado pela aplicação.
    const premium = {};
    const premiumBase = [
      ['tresBadges', 'Trilogia Técnica', 'Conquistar 3 badges normais.', 300, 'TOTAL_BADGES', 3, null],
      ['doisEm90Dias', 'Ritmo de Aprendizagem', 'Conquistar 2 badges num período de 90 dias.', 125, 'BADGES_DIAS', 2, 90],
      ['elitePontos', 'Elite de Pontos Softinsa', 'Atingir 1500 pontos na plataforma.', 250, 'TOTAL_PONTOS', 1500, null],
      ['melhorAno', 'Consultor do Ano', 'Terminar o ano no primeiro lugar do ranking.', 500, 'MELHOR_ANO', hoje.getFullYear(), null],
      ['melhorTrimestre', 'Destaque Trimestral', 'Ser o melhor consultor durante 3 meses consecutivos.', 400, 'MELHOR_MESES', 3, null]
    ];
    for (const [chave, titulo, descricao, pontos, tipo, parametro1, parametro2] of premiumBase) {
      premium[chave] = await MarcoConquista.create({
        TITULO_MARCO: titulo,
        DESCRICAO_MARCO: descricao,
        PONTOS_EXTRA: pontos,
        REGRA_ATRIBUICAO: descricao,
        URL_IMAGEM_MARCO: IMAGEM_BADGE,
        TIPO_MARCO: tipo,
        PARAMETRO_1: parametro1,
        PARAMETRO_2: parametro2
      });
    }

    // 7. Contas dos quatro perfis e contas mistas para testar múltiplas Service Lines.
    const talentUser = await criarUtilizador({
      nome: 'Teresa Talent Manager',
      email: 'talent@softinsa.pt',
      perfis: ['Talent Manager'],
      adminId: admin.ID_ADMIN
    });
    await TalentManager.create({
      ID_UTILIZADOR: talentUser.ID_UTILIZADOR,
      DATA_INICIO_FUNC: diasAtras(300)
    });

    const sllHybridUser = await criarUtilizador({
      nome: 'Samuel Hybrid Leader',
      email: 'sll.hybrid@softinsa.pt',
      perfis: ['Service Line Leader'],
      adminId: admin.ID_ADMIN,
      serviceLine: contextos.lowcode.item.serviceLine
    });
    const sllHybrid = await ServiceLineLeader.create({
      ID_UTILIZADOR: sllHybridUser.ID_UTILIZADOR,
      CARGO_SLL: 'Service Line Leader - Hybrid Cloud',
      DATA_INICIO_FUNCOES: diasAtras(300)
    });
    await contextos.lowcode.serviceLine.update({ ID_SLL: sllHybrid.ID_SLL });

    const consultorUser = await criarUtilizador({
      nome: 'João Martins',
      email: 'consultor@softinsa.pt',
      perfis: ['Consultor'],
      adminId: admin.ID_ADMIN,
      serviceLine: contextos.lowcode.item.serviceLine,
      area: contextos.lowcode.item.area
    });
    const consultorPrincipal = await Consultor.create({
      ID_UTILIZADOR: consultorUser.ID_UTILIZADOR,
      ID_AREA: contextos.lowcode.area.ID_AREA,
      DATA_ENTRADA_EMPRESA: diasAtras(420),
      PONTUACAO_TOTAL: 0
    });

    const martaUser = await criarUtilizador({
      nome: 'Marta Rodrigues',
      email: 'marta.app@softinsa.pt',
      perfis: ['Consultor', 'Talent Manager'],
      adminId: admin.ID_ADMIN,
      serviceLine: contextos.devops.item.serviceLine,
      area: contextos.devops.item.area
    });
    const martaConsultor = await Consultor.create({
      ID_UTILIZADOR: martaUser.ID_UTILIZADOR,
      ID_AREA: contextos.devops.area.ID_AREA,
      DATA_ENTRADA_EMPRESA: diasAtras(500),
      PONTUACAO_TOTAL: 0
    });
    await TalentManager.create({
      ID_UTILIZADOR: martaUser.ID_UTILIZADOR,
      DATA_INICIO_FUNC: diasAtras(250)
    });

    const hugoUser = await criarUtilizador({
      nome: 'Hugo Almeida',
      email: 'hugo.app@softinsa.pt',
      perfis: ['Consultor', 'Service Line Leader'],
      adminId: admin.ID_ADMIN,
      serviceLine: contextos.devops.item.serviceLine,
      area: contextos.devops.item.area
    });
    const hugoConsultor = await Consultor.create({
      ID_UTILIZADOR: hugoUser.ID_UTILIZADOR,
      ID_AREA: contextos.devops.area.ID_AREA,
      DATA_ENTRADA_EMPRESA: diasAtras(620),
      PONTUACAO_TOTAL: 0
    });
    const sllApp = await ServiceLineLeader.create({
      ID_UTILIZADOR: hugoUser.ID_UTILIZADOR,
      CARGO_SLL: 'Service Line Leader - Application Operations',
      DATA_INICIO_FUNCOES: diasAtras(260)
    });
    await contextos.devops.serviceLine.update({ ID_SLL: sllApp.ID_SLL });

    const sofiaUser = await criarUtilizador({
      nome: 'Sofia Costa',
      email: 'sofia.talent@softinsa.pt',
      perfis: ['Consultor', 'Talent Manager', 'Service Line Leader'],
      adminId: admin.ID_ADMIN,
      serviceLine: contextos.talent.item.serviceLine,
      area: contextos.talent.item.area
    });
    const sofiaConsultor = await Consultor.create({
      ID_UTILIZADOR: sofiaUser.ID_UTILIZADOR,
      ID_AREA: contextos.talent.area.ID_AREA,
      DATA_ENTRADA_EMPRESA: diasAtras(700),
      PONTUACAO_TOTAL: 0
    });
    await TalentManager.create({
      ID_UTILIZADOR: sofiaUser.ID_UTILIZADOR,
      DATA_INICIO_FUNC: diasAtras(280)
    });
    const sllTalent = await ServiceLineLeader.create({
      ID_UTILIZADOR: sofiaUser.ID_UTILIZADOR,
      CARGO_SLL: 'Service Line Leader - Sourcing & Talent Management',
      DATA_INICIO_FUNCOES: diasAtras(280)
    });
    await contextos.talent.serviceLine.update({ ID_SLL: sllTalent.ID_SLL });

    const utilizadores = [
      adminUser,
      talentUser,
      sllHybridUser,
      consultorUser,
      martaUser,
      hugoUser,
      sofiaUser
    ];
    for (const utilizador of utilizadores) await criarPreferencia(utilizador);

    // 8. Dois badges LowCode já aprovados para o consultor principal.
    await criarPedidoAceite({
      consultor: consultorPrincipal,
      utilizadorConsultor: consultorUser,
      badge: contextos.lowcode.badges.A,
      talentManager: talentUser,
      serviceLineLeader: sllHybridUser,
      dataSubmissao: diasAtras(82),
      ficheirosEvidencia
    });
    await criarPedidoAceite({
      consultor: consultorPrincipal,
      utilizadorConsultor: consultorUser,
      badge: contextos.lowcode.badges.B,
      talentManager: talentUser,
      serviceLineLeader: sllHybridUser,
      dataSubmissao: diasAtras(47),
      ficheirosEvidencia
    });

    // Premium inicial; o premium de 3 badges permanece livre para disparar após obter o nível C.
    await MarcoConsultor.create({
      ID_CONSULTOR: consultorPrincipal.ID_CONSULTOR,
      ID_MARCO: premium.doisEm90Dias.ID_MARCO,
      DATA_CONQUISTA: diasAtras(40)
    });
    await HistoricoPontuacao.create({
      ID_UTILIZADOR: consultorUser.ID_UTILIZADOR,
      DATA_ATRIBUICAO: diasAtras(40),
      PONTOS_OBTIDOS: premium.doisEm90Dias.PONTOS_EXTRA,
      ORIGEM_PONTOS: `Badge Premium: ${premium.doisEm90Dias.TITULO_MARCO}`
    });
    await Notificacao.create({
      ID_UTILIZADOR: consultorUser.ID_UTILIZADOR,
      TITULO_NOTIFICACAO: 'Badge Premium conquistado',
      MENSAGEM_NOTIFICACAO: `Conquistou "${premium.doisEm90Dias.TITULO_MARCO}".`,
      DATA_ENVIO_NOTIFICACAO: diasAtras(40),
      ESTADO_LIDO: true,
      TIPO_NOTIFICACAO: 'badge'
    });
    await consultorPrincipal.update({
      PONTUACAO_TOTAL:
        contextos.lowcode.badges.A.PONTOS_BADGE
        + contextos.lowcode.badges.B.PONTOS_BADGE
        + premium.doisEm90Dias.PONTOS_EXTRA
    });

    // 9. Dados de outras Service Lines para o Talent Manager e isolamento do SLL Hybrid.
    await criarPedidoAceite({
      consultor: martaConsultor,
      utilizadorConsultor: martaUser,
      badge: contextos.devops.badges.A,
      talentManager: talentUser,
      serviceLineLeader: hugoUser,
      dataSubmissao: diasAtras(65),
      ficheirosEvidencia: [ficheirosEvidencia[3]]
    });
    await criarPedidoAceite({
      consultor: martaConsultor,
      utilizadorConsultor: martaUser,
      badge: contextos.devops.badges.B,
      talentManager: talentUser,
      serviceLineLeader: hugoUser,
      dataSubmissao: diasAtras(25),
      ficheirosEvidencia: [ficheirosEvidencia[3]]
    });
    await martaConsultor.update({
      PONTUACAO_TOTAL: contextos.devops.badges.A.PONTOS_BADGE + contextos.devops.badges.B.PONTOS_BADGE
    });

    await atribuirBadgeDireto({
      consultor: hugoConsultor,
      utilizador: hugoUser,
      badge: contextos.devops.badges.C,
      dias: 15
    });
    await hugoConsultor.update({ PONTUACAO_TOTAL: contextos.devops.badges.C.PONTOS_BADGE });

    await atribuirBadgeDireto({
      consultor: sofiaConsultor,
      utilizador: sofiaUser,
      badge: contextos.talent.badges.A,
      dias: 110
    });
    await atribuirBadgeDireto({
      consultor: sofiaConsultor,
      utilizador: sofiaUser,
      badge: contextos.talent.badges.B,
      dias: 20
    });
    await sofiaConsultor.update({
      PONTUACAO_TOTAL: contextos.talent.badges.A.PONTOS_BADGE + contextos.talent.badges.B.PONTOS_BADGE
    });

    // 10. Objetivos, avisos, notificações e atividade útil para os dashboards.
    await ObjetivoTimeline.create({
      ID_UTILIZADOR: consultorUser.ID_UTILIZADOR,
      TITULO: 'Conquistar o badge OutSystems Especialista',
      DESCRICAO: 'Submeter as evidências do nível C e concluir o terceiro badge LowCode.',
      DATA_OBJETIVO: adicionarDias(hoje, 90),
      STATUS: 'Em Progresso',
      DATA_CONCLUSAO: null,
      ORIGEM: 'Criado por mim'
    });
    await ObjetivoTimeline.create({
      ID_UTILIZADOR: martaUser.ID_UTILIZADOR,
      TITULO: 'Preparar certificação DevSecOps',
      DESCRICAO: 'Evoluir para o nível C da área DevSecOps & IT Automation.',
      DATA_OBJETIVO: adicionarDias(hoje, 120),
      STATUS: 'Em Progresso',
      DATA_CONCLUSAO: null,
      ORIGEM: 'Talent Manager'
    });

    await AvisoGeral.bulkCreate([
      {
        TITULO_AVISO: 'Catálogo técnico atualizado',
        CONTEUDO_AVISO: 'Os 15 badges da Jornada Técnica já estão disponíveis para consulta.',
        DATA_PUBLICACAO_AVISO: diasAtras(2),
        TIPO_NOTIFICACAO: 'Informativo',
        ESTADO_AVISO: 'Ativo',
        VISIBILIDADE_AVISO: 'Todos'
      },
      {
        TITULO_AVISO: 'Pedidos aguardam validação',
        CONTEUDO_AVISO: 'Consulte regularmente os pedidos pendentes e o respetivo histórico.',
        DATA_PUBLICACAO_AVISO: diasAtras(1),
        TIPO_NOTIFICACAO: 'Alerta',
        ESTADO_AVISO: 'Ativo',
        VISIBILIDADE_AVISO: 'Talent + SLL'
      }
    ]);

    await Notificacao.bulkCreate([
      {
        ID_UTILIZADOR: talentUser.ID_UTILIZADOR,
        TITULO_NOTIFICACAO: 'Resumo de validações',
        MENSAGEM_NOTIFICACAO: 'Os pedidos aprovados de demonstração estão disponíveis no histórico.',
        DATA_ENVIO_NOTIFICACAO: diasAtras(1),
        ESTADO_LIDO: false,
        TIPO_NOTIFICACAO: 'system'
      },
      {
        ID_UTILIZADOR: sllHybridUser.ID_UTILIZADOR,
        TITULO_NOTIFICACAO: 'Atividade Hybrid Cloud',
        MENSAGEM_NOTIFICACAO: 'O consultor João Martins possui dois badges aprovados na sua Service Line.',
        DATA_ENVIO_NOTIFICACAO: diasAtras(1),
        ESTADO_LIDO: false,
        TIPO_NOTIFICACAO: 'system'
      }
    ]);

    await LogAtividadeSistema.bulkCreate([
      {
        ID_UTILIZADOR: adminUser.ID_UTILIZADOR,
        TIPO_ATIVIDADE: 'Seed de demonstração',
        DETALHES_ATIVIDADE: 'Criou a Jornada Técnica, 3 Service Lines, 3 áreas, 15 níveis e 15 badges.',
        DATA_HORA_ATIVIDADE: hoje
      },
      {
        ID_UTILIZADOR: consultorUser.ID_UTILIZADOR,
        TIPO_ATIVIDADE: 'Badge Premium Obtido',
        DETALHES_ATIVIDADE: `Ganhou o badge premium ${premium.doisEm90Dias.TITULO_MARCO}.`,
        DATA_HORA_ATIVIDADE: diasAtras(40)
      }
    ]);

    for (const contexto of Object.values(contextos)) {
      await EstatisticasAcesso.create({
        ID_SERVICE_LINE: contexto.serviceLine.ID_SERVICE_LINE,
        DATA_REFERENCIA: hoje,
        TOTAL_ACESSOS_DIA: contexto.item.chave === 'lowcode' ? 18 : 9
      });
    }

    // Validações finais para o seed falhar cedo se a estrutura ficar incompleta.
    const validacao = {
      learningPaths: await LearningPath.count(),
      serviceLines: await ServiceLine.count(),
      areas: await Area.count(),
      niveis: await Nivel.count(),
      badges: await Badge.count(),
      premium: await MarcoConquista.count(),
      utilizadores: await Utilizador.count(),
      pedidosAceites: await Pedido.count({ where: { ESTADO_PEDIDO: 'Aceite' } })
    };
    if (
      validacao.learningPaths !== 1
      || validacao.serviceLines !== 3
      || validacao.areas !== 3
      || validacao.niveis !== 15
      || validacao.badges !== 15
      || validacao.premium !== 5
    ) {
      throw new Error(`Seed incompleto: ${JSON.stringify(validacao)}`);
    }

    console.log('\nSeed concluído com sucesso.');
    console.table(validacao);
    console.log(`\nPassword comum: ${PASSWORD_TESTE}`);
    console.log('admin@softinsa.pt        (Administrador global da plataforma)');
    console.log('consultor@softinsa.pt    (Consultor - Hybrid Cloud - Área LowCode (Outsystems))');
    console.log('talent@softinsa.pt       (Talent Manager global - todas as Service Lines e áreas)');
    console.log('sll.hybrid@softinsa.pt   (Service Line Leader - Hybrid Cloud)');
    console.log('marta.app@softinsa.pt    (Consultor - Application Operations - Área DevSecOps & IT Automation – DevOps + Talent Manager global)');
    console.log('hugo.app@softinsa.pt     (Consultor - Application Operations - Área DevSecOps & IT Automation – DevOps + Service Line Leader - Application Operations)');
    console.log('sofia.talent@softinsa.pt (Consultor - Sourcing & Talent Management - Área Sourcing & Talent Management - Talent Managem + Talent Manager global + Service Line Leader - Sourcing & Talent Management)\n');

    return validacao;
  } catch (error) {
    console.error('Erro ao executar o seed:', error);
    throw error;
  }
}

if (require.main === module) {
  seedDatabase()
    .then(async () => {
      await sequelize.close();
      process.exit(0);
    })
    .catch(async () => {
      await sequelize.close();
      process.exit(1);
    });
} else {
  module.exports = seedDatabase;
}
