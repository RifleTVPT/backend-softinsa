const fs = require('fs');
const path = require('path');
const sequelize = require('./config/database');

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
  ServiceLineLearningPath,
  Area,
  Nivel,
  RequisitoPadrao,
  Badge,
  Requisito,
  MarcoConquista,
  ConsultorBadge,
  MarcoConsultor,
  Pedido,
  HistoricoPedido,
  RegistoHistoricoPedido,
  HistoricoPontuacao,
  Notificacao,
  ObjetivoTimeline,
  ConfiguracoesSistema,
  PreferenciasUtilizador,
  LogAtividadeSistema
} = sequelize.models;

const PASSWORD_PADRAO = 'Softinsa@2026';
const IMAGEM_BADGE_PADRAO = '/uploads/default-trophy.png';
const IMAGEM_PREMIUM_PADRAO = '/uploads/default-trophy.png';
const DATA_BASE = new Date();

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
    descricaoSL: 'Modernização aplicacional, cloud e desenvolvimento rápido de soluções empresariais.',
    area: 'LowCode (Outsystems)',
    descricaoArea: 'Construção, manutenção e evolução de aplicações empresariais em OutSystems.',
    prefixoBadge: 'OutSystems',
    requisitosPadrao: {
      A: [
        'Concluir formação introdutória de OutSystems e apresentar comprovativo.',
        'Criar uma aplicação simples com ecrãs, entidades e lógica básica documentada.'
      ],
      B: [
        'Demonstrar integração REST ou SOAP numa aplicação OutSystems.'
      ],
      D: [
        'Apresentar uma solução modular com arquitetura preparada para manutenção evolutiva.'
      ]
    },
    descricaoPorNivel: {
      A: 'Valida conhecimentos iniciais em OutSystems, criação de interfaces e lógica simples.',
      B: 'Reconhece autonomia em desenvolvimento OutSystems com integrações e boas práticas.',
      C: 'Certifica capacidade de desenhar soluções robustas, reutilizáveis e orientadas ao negócio.',
      D: 'Distingue especialistas capazes de orientar arquitetura, performance e qualidade técnica.',
      E: 'Reconhece liderança técnica em LowCode, mentoria e definição de standards de entrega.'
    }
  },
  {
    chave: 'devops',
    serviceLine: 'Application Operations',
    descricaoSL: 'Operação aplicacional, automação, DevSecOps, observabilidade e melhoria contínua.',
    area: 'DevSecOps & IT Automation - DevOps',
    descricaoArea: 'Automação de deployments, segurança contínua, infraestrutura como código e monitorização.',
    prefixoBadge: 'DevSecOps & Automation',
    requisitosPadrao: {
      B: [
        'Construir ou melhorar um pipeline CI/CD com validações automáticas.'
      ],
      C: [
        'Configurar observabilidade para uma aplicação crítica com métricas, logs e alertas.'
      ],
      E: [
        'Definir uma prática de DevSecOps replicável para uma equipa ou cliente.'
      ]
    },
    descricaoPorNivel: {
      A: 'Valida fundamentos de operação aplicacional, controlo de versões e processos de deployment.',
      B: 'Reconhece capacidade de automatizar entregas e reduzir tarefas manuais recorrentes.',
      C: 'Certifica autonomia em observabilidade, gestão de incidentes e segurança operacional.',
      D: 'Distingue especialistas em desenho de pipelines, IaC e práticas DevSecOps avançadas.',
      E: 'Reconhece liderança na definição de modelos operacionais, standards e melhoria contínua.'
    }
  },
  {
    chave: 'talent',
    serviceLine: 'Sourcing & Talent Management',
    descricaoSL: 'Atração, desenvolvimento, acompanhamento e retenção de talento.',
    area: 'Sourcing & Talent Management - Talent Management',
    descricaoArea: 'Competências de sourcing, recrutamento, desenvolvimento, acompanhamento e gestão de talento.',
    prefixoBadge: 'Talent Management',
    requisitosPadrao: {
      A: [
        'Concluir formação introdutória em processos de sourcing e acompanhamento de talento.'
      ],
      C: [
        'Apresentar um plano de desenvolvimento profissional aplicado a um caso real ou simulado.'
      ],
      E: [
        'Comprovar liderança numa iniciativa de mentoria, retenção ou desenvolvimento de talento.'
      ]
    },
    descricaoPorNivel: {
      A: 'Valida fundamentos de sourcing, comunicação com candidatos e acompanhamento inicial.',
      B: 'Reconhece autonomia na gestão de processos, triagem e comunicação estruturada.',
      C: 'Certifica capacidade de desenhar planos de desenvolvimento e acompanhar evolução profissional.',
      D: 'Distingue especialistas em estratégia de talento, métricas de retenção e melhoria de processos.',
      E: 'Reconhece liderança em programas de talento, mentoria e alinhamento com objetivos organizacionais.'
    }
  }
];

const tituloNivel = {
  A: 'Fundamentos Júnior',
  B: 'Profissional Intermédio',
  C: 'Sénior',
  D: 'Especialista',
  E: 'Líder de Conhecimento'
};

const dificuldadePorNivel = {
  A: [
    'Submeta um certificado ou comprovativo de formação introdutória relacionado com esta competência.',
    'Entregue um pequeno resumo técnico com os conceitos essenciais aplicados.',
    'Inclua uma evidência prática simples demonstrando aplicação básica no contexto profissional.'
  ],
  B: [
    'Apresente uma evidência prática com autonomia na execução de uma tarefa desta área.',
    'Documente decisões tomadas, ferramentas utilizadas e resultado obtido.',
    'Inclua feedback, validação interna ou outro comprovativo de aplicação em contexto real.'
  ],
  C: [
    'Submeta evidência de participação relevante num projeto ou iniciativa com impacto mensurável.',
    'Explique os riscos identificados, as decisões técnicas ou funcionais e as melhorias implementadas.',
    'Inclua documentação que demonstre capacidade de análise, planeamento e execução autónoma.'
  ],
  D: [
    'Apresente um caso avançado onde tenha definido abordagem, arquitetura, processo ou estratégia.',
    'Inclua evidência de resolução de problemas complexos, otimização ou melhoria significativa.',
    'Demonstre partilha de conhecimento com equipa, cliente ou comunidade interna.',
    'Anexe documentação de suporte com conclusões, métricas ou resultados obtidos.'
  ],
  E: [
    'Comprove liderança técnica ou funcional numa iniciativa relevante para a área.',
    'Demonstre impacto organizacional, mentoria ou criação de standards reutilizáveis.',
    'Apresente evidências de acompanhamento de outros colaboradores ou influência em decisões críticas.',
    'Inclua documentação final com resultados, lições aprendidas e recomendações futuras.'
  ]
};

const validadeBadgeNormal = (areaChave, nivelLetra) => {
  const regras = {
    lowcode: {
      A: { dias: 30, meses: null },
      B: { dias: null, meses: 24 },
      C: { dias: null, meses: 36 },
      D: { dias: null, meses: 48 },
      E: { dias: null, meses: null }
    },
    devops: {
      A: { dias: null, meses: 12 },
      B: { dias: 30, meses: null },
      C: { dias: null, meses: null },
      D: { dias: null, meses: 48 },
      E: { dias: null, meses: 60 }
    },
    talent: {
      A: { dias: null, meses: null },
      B: { dias: null, meses: 18 },
      C: { dias: null, meses: 24 },
      D: { dias: 30, meses: null },
      E: { dias: null, meses: 60 }
    }
  };

  return regras[areaChave]?.[nivelLetra] || { dias: null, meses: 24 };
};

const categoriaBadge = item => JSON.stringify({
  serviceLine: item.serviceLine,
  area: item.area
});

const criarPreferencias = async utilizador => PreferenciasUtilizador.create({
  ID_UTILIZADOR: utilizador.ID_UTILIZADOR,
  IDIOMA_APP: 'pt',
  RECEBER_EMAIL_PEDIDOS: true,
  RECEBER_PUSH_EXPIRACAO: true,
  EXIBIR_LINK_PUBLICO: true,
  TERMOS_RGPD: true
});

const criarUtilizadorBase = async ({
  nome,
  email,
  perfis,
  adminId,
  serviceLine = 'Global',
  area = 'Global',
  primeiroAcesso = false
}) => {
  const utilizador = await Utilizador.create({
    ID_ADMIN: adminId || null,
    NOME_COMPLETO_UTILIZADOR: nome,
    EMAIL_UTILIZADOR: email,
    PASSWORD_UTILIZADOR: PASSWORD_PADRAO,
    PERFIL_UTILIZADOR: perfis.join(' / '),
    ESTADO_CONTA_UTILIZADOR: 'Ativo',
    DATA_REGISTO_UTILIZADOR: DATA_BASE,
    IS_PRIMEIRO_ACESSO: primeiroAcesso,
    SL_REGISTO: serviceLine,
    AREA_REGISTO: area
  });

  await criarPreferencias(utilizador);
  return utilizador;
};

const adicionarPerfisOperacionais = async ({ utilizador, perfis, areaObj, cargoSll = null }) => {
  const resultado = {};

  if (perfis.includes('Administrador')) {
    resultado.admin = await Administrador.create({
      ID_UTILIZADOR: utilizador.ID_UTILIZADOR,
      DATA_REGISTO_PLATAFORMA: DATA_BASE
    });
  }

  if (perfis.includes('Consultor')) {
    resultado.consultor = await Consultor.create({
      ID_UTILIZADOR: utilizador.ID_UTILIZADOR,
      DATA_ENTRADA_EMPRESA: DATA_BASE,
      PONTUACAO_TOTAL: 0,
      ID_AREA: areaObj?.ID_AREA || null
    });
  }

  if (perfis.includes('Talent Manager')) {
    resultado.talentManager = await TalentManager.create({
      ID_UTILIZADOR: utilizador.ID_UTILIZADOR,
      DATA_INICIO_FUNC: DATA_BASE
    });
  }

  if (perfis.includes('Service Line Leader')) {
    resultado.sll = await ServiceLineLeader.create({
      ID_UTILIZADOR: utilizador.ID_UTILIZADOR,
      CARGO_SLL: cargoSll || 'Service Line Leader',
      DATA_INICIO_FUNCOES: DATA_BASE
    });
  }

  return resultado;
};

const criarRequisitosBadge = async ({ badge, nivel, descricoes, quantidadePadrao }) => {
  const total = Math.max(quantidadePadrao + 2, descricoes.length);
  for (let idx = 0; idx < total; idx++) {
    await Requisito.create({
      ID_BADGE: badge.ID_BADGE,
      TITULO_REQUISITO: `Requisito ${nivel.letra}${idx + 1}`,
      DESCRICAO_REQUISITO: descricoes[idx] || `Apresente evidência complementar adequada ao nível ${nivel.nome}.`,
      TIPO_REQUISITO: idx < quantidadePadrao ? 'Padrão' : 'Ficheiro'
    });
  }
};

const criarBadgeNormal = async ({ item, areaObj, nivelObj, nivel, adminId, requisitosPadraoNivel }) => {
  const nomeBadge = `${item.prefixoBadge} - ${tituloNivel[nivel.letra]}`;
  const descricaoBadge = `${item.descricaoPorNivel[nivel.letra]} Este badge comprova evolução no percurso ${item.area}, com evidências proporcionais ao nível ${nivel.nome}.`;
  const validade = validadeBadgeNormal(item.chave, nivel.letra);
  const badge = await Badge.create({
    ID_CATEGORIA: 1,
    ID_NIVEL: nivelObj.ID_NIVEL,
    ID_ADMIN: adminId,
    NOME_BADGE: nomeBadge,
    DESCRICAO_BADGE: descricaoBadge,
    CATEGORIA_BADGE: categoriaBadge(item),
    PONTOS_BADGE: nivel.pontos,
    URL_IMAGEM: IMAGEM_BADGE_PADRAO,
    TEMPO_EXPIRACAO_BADGE: validade.dias,
    IS_PREMIUM: false,
    VALIDADE_MESES: validade.meses,
    VALIDADE_EXPIRACAO: null
  });

  const descricoesBase = [
    ...(requisitosPadraoNivel || []),
    ...dificuldadePorNivel[nivel.letra].map(texto => `${texto} A evidência deve estar alinhada com ${item.area}.`)
  ];

  await criarRequisitosBadge({
    badge,
    nivel,
    descricoes: descricoesBase,
    quantidadePadrao: requisitosPadraoNivel?.length || 0
  });

  return badge;
};

const criarBadgePremium = async ({ titulo, descricao, pontos, tipo, param1, param2 = null }) => {
  const textos = {
    TOTAL_BADGES: `Obtenha um total de ${param1} badges aprovados na plataforma.`,
    TOTAL_PONTOS: `Acumule ${param1} pontos totais na plataforma.`,
    BADGES_DIAS: `Obtenha ${param1} badges aprovados num período de ${param2} dias.`,
    MELHOR_ANO: `Seja o consultor com mais pontos acumulados durante o ano civil de ${param1}.`,
    MELHOR_MESES: `Seja o consultor com mais pontos acumulados durante ${param1} meses consecutivos.`
  };

  return MarcoConquista.create({
    TITULO_MARCO: titulo,
    DESCRICAO_MARCO: descricao,
    PONTOS_EXTRA: pontos,
    REGRA_ATRIBUICAO: textos[tipo],
    URL_IMAGEM_MARCO: IMAGEM_PREMIUM_PADRAO,
    TIPO_MARCO: tipo,
    PARAMETRO_1: param1,
    PARAMETRO_2: param2,
    DATA_CRIACAO_MARCO: DATA_BASE
  });
};

const addDays = (date, days) => {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
};

const addMonths = (date, months) => {
  const result = new Date(date);
  result.setMonth(result.getMonth() + months);
  return result;
};

const dataRelativa = ({ meses = 0, dias = 0 }) => addDays(addMonths(DATA_BASE, meses), dias);

const calcularExpiracaoSeed = (badge, dataAtribuicao) => {
  if (badge.TEMPO_EXPIRACAO_BADGE) return addDays(dataAtribuicao, badge.TEMPO_EXPIRACAO_BADGE);
  if (badge.VALIDADE_MESES) return addMonths(dataAtribuicao, badge.VALIDADE_MESES);
  return null;
};

const getRequisitoCodigo = requisito => {
  const titulo = String(requisito?.TITULO_REQUISITO || '');
  const match = titulo.match(/Requisito\s+([A-Z]\d+)/i);
  return match ? match[1].toUpperCase() : null;
};

const criarHistoricoDemo = async ({ pedido, passos }) => {
  for (const passo of passos) {
    const historico = await HistoricoPedido.create({
      ID_UTILIZADOR: passo.idUtilizador,
      DATA_REGISTO_PEDIDO: passo.data,
      ESTADO_ATUAL_PEDIDO: passo.estado,
      TIPO_ACAO: passo.acao,
      COMENTARIO_VALIDADOR: passo.comentario || null,
      PERFIL_DECISOR: passo.perfil,
      STATUS_RESULTADO: passo.resultado
    });

    await RegistoHistoricoPedido.create({
      ID_PEDIDO: pedido.ID_PEDIDO,
      ID_HISTORICO: historico.ID_HISTORICO
    });
  }
};

const criarPedidoDemo = async ({
  consultorUser,
  badge,
  estado,
  data,
  tmId = null,
  sllId = null,
  decisorTmUserId = null,
  decisorSllUserId = null,
  comentario = null,
  incluirEvidencias = true
}) => {
  const pedido = await Pedido.create({
    ID_UTILIZADOR: consultorUser.ID_UTILIZADOR,
    ID_TM: tmId,
    ID_SLL: sllId,
    ID_BADGE: badge.ID_BADGE,
    DATA_SUBMISSAO_PEDIDO: data,
    ESTADO_PEDIDO: estado,
    COMENTARIO_CONSULTOR: `Candidatura de demonstração ao badge ${badge.NOME_BADGE}.`,
    DATA_ULTIMA_ATUALIZACAO: addDays(data, estado === 'Pendente' ? 0 : 2)
  });

  const passos = [
    {
      idUtilizador: consultorUser.ID_UTILIZADOR,
      data,
      estado: 'Pendente',
      acao: 'Submeteu candidatura',
      perfil: 'Consultor',
      resultado: 'pending'
    }
  ];

  if (['Em Análise SLL', 'Aceite', 'Recusado', 'Rascunho'].includes(estado) && decisorTmUserId) {
    passos.push({
      idUtilizador: decisorTmUserId,
      data: addDays(data, 1),
      estado: estado === 'Recusado' && !sllId ? 'Recusado' : 'Em Análise SLL',
      acao: estado === 'Recusado' && !sllId ? 'Rejeitou o pedido' : 'Validou e enviou para o SLL',
      comentario: estado === 'Recusado' && !sllId
        ? (comentario || 'Evidências insuficientes para validação pelo Talent Manager.')
        : 'Pedido validado pelo Talent Manager.',
      perfil: 'Talent Manager',
      resultado: estado === 'Recusado' && !sllId ? 'danger' : 'success'
    });
  }

  if (['Aceite', 'Recusado', 'Rascunho'].includes(estado) && sllId && decisorSllUserId) {
    passos.push({
      idUtilizador: decisorSllUserId,
      data: addDays(data, 2),
      estado,
      acao: estado === 'Aceite'
        ? 'Aprovou o pedido'
        : (estado === 'Recusado' ? 'Rejeitou o pedido' : 'Devolveu para correção'),
      comentario: comentario || (estado === 'Aceite'
        ? 'Evidências aceites e badge atribuído.'
        : (estado === 'Recusado'
          ? 'Pedido recusado após validação final.'
          : 'Rever ou substituir as evidências assinaladas.')),
      perfil: 'Service Line Leader',
      resultado: estado === 'Aceite' ? 'success' : (estado === 'Recusado' ? 'danger' : 'pending')
    });
  }

  await criarHistoricoDemo({ pedido, passos });

  if (incluirEvidencias) {
    const requisitos = await Requisito.findAll({
      where: { ID_BADGE: badge.ID_BADGE },
      order: [['ID_REQUISITO', 'ASC']],
      limit: 3
    });

    for (const requisito of requisitos) {
      const codigo = getRequisitoCodigo(requisito) || `REQ${requisito.ID_REQUISITO}`;
      await sequelize.models.Evidencia.create({
        ID_PEDIDO: pedido.ID_PEDIDO,
        ID_REQUISITO: requisito.ID_REQUISITO,
        NOME_FICHEIRO: `${codigo}_evidencia_demo.pdf`,
        REQUISITO_MAPEADO: codigo,
        URL_FICHEIRO: `/uploads/simulacao/${codigo}_evidencia_demo.pdf`
      });
    }
  }

  return pedido;
};

const atribuirBadgeDemo = async ({ consultor, utilizador, badge, data, motivo }) => {
  const expiracao = calcularExpiracaoSeed(badge, data);

  await ConsultorBadge.create({
    ID_CONSULTOR: consultor.ID_CONSULTOR,
    ID_BADGE: badge.ID_BADGE,
    DATA_ATRIBUICAO_BADGE: data,
    MOTIVO_ATRIBUICAO: motivo,
    DATA_EXPIRACAO: expiracao,
    LINK_UNICO_BADGE: `SFT-${consultor.ID_CONSULTOR}-${badge.ID_BADGE}-${data.getFullYear()}${String(data.getMonth() + 1).padStart(2, '0')}`,
    STATUS_GALERIA_PUBLICA: true
  });

  await HistoricoPontuacao.create({
    ID_UTILIZADOR: utilizador.ID_UTILIZADOR,
    DATA_ATRIBUICAO: data,
    PONTOS_OBTIDOS: badge.PONTOS_BADGE,
    ORIGEM_PONTOS: `Badge: ${badge.NOME_BADGE}`
  });

  return Number(badge.PONTOS_BADGE) || 0;
};

const atribuirMarcoDemo = async ({ consultor, utilizador, marco, data }) => {
  await MarcoConsultor.create({
    ID_CONSULTOR: consultor.ID_CONSULTOR,
    ID_MARCO: marco.ID_MARCO,
    DATA_CONQUISTA: data
  });

  await HistoricoPontuacao.create({
    ID_UTILIZADOR: utilizador.ID_UTILIZADOR,
    DATA_ATRIBUICAO: data,
    PONTOS_OBTIDOS: marco.PONTOS_EXTRA,
    ORIGEM_PONTOS: `Conquista Especial: ${marco.TITULO_MARCO}`
  });

  return Number(marco.PONTOS_EXTRA) || 0;
};

const criarDemoUtilizadoresAdicionais = async ({ contexto, adicionais, marcos, talentPrincipal, sllHybrid }) => {
  const porTituloMarco = Object.fromEntries(marcos.map(m => [m.TITULO_MARCO, m]));
  const totalPorConsultor = new Map();
  const somar = (consultor, pontos) => totalPorConsultor.set(
    consultor.ID_CONSULTOR,
    (totalPorConsultor.get(consultor.ID_CONSULTOR) || 0) + pontos
  );

  const { hugo, sofia, marta } = adicionais;
  const dataHugoA = dataRelativa({ meses: -5, dias: -8 });
  const dataHugoB = dataRelativa({ meses: -3, dias: -3 });
  const dataSofiaA = dataRelativa({ meses: -4, dias: -14 });
  const dataSofiaB = dataRelativa({ meses: -2, dias: -7 });
  const dataMartaA = dataRelativa({ meses: -6, dias: -5 });
  const dataMartaB = dataRelativa({ meses: -1, dias: -12 });
  const dataMartaC = dataRelativa({ dias: -12 });

  const dadosAceites = [
    { pessoa: hugo, badge: contexto.devops.badges.A, data: dataHugoA, tm: talentPrincipal, sll: hugo, motivo: 'Atribuído por candidatura aceite pelo SLL de Application Operations.' },
    { pessoa: hugo, badge: contexto.lowcode.badges.A, data: dataHugoB, tm: marta, sll: sllHybrid, motivo: 'Badge obtido numa Service Line externa.' },
    { pessoa: sofia, badge: contexto.talent.badges.A, data: dataSofiaA, tm: talentPrincipal, sll: marta, motivo: 'Atribuído por candidatura aceite na área Talent Management.' },
    { pessoa: sofia, badge: contexto.devops.badges.B, data: dataSofiaB, tm: marta, sll: hugo, motivo: 'Badge obtido fora da Service Line principal da consultora.' },
    { pessoa: marta, badge: contexto.talent.badges.A, data: dataMartaA, tm: sofia, sll: marta, motivo: 'Atribuído por candidatura aceite.' },
    { pessoa: marta, badge: contexto.lowcode.badges.B, data: dataMartaB, tm: sofia, sll: sllHybrid, motivo: 'Badge obtido em Hybrid Cloud.' },
    { pessoa: marta, badge: contexto.talent.badges.D, data: dataMartaC, tm: sofia, sll: marta, motivo: 'Badge de validade curta para testar renovação.' }
  ];

  for (const item of dadosAceites) {
    await criarPedidoDemo({
      consultorUser: item.pessoa.utilizador,
      badge: item.badge,
      estado: 'Aceite',
      data: item.data,
      tmId: item.tm.perfisCriados.talentManager?.ID_TM || null,
      sllId: item.sll.perfisCriados.sll?.ID_SLL || null,
      decisorTmUserId: item.tm.utilizador.ID_UTILIZADOR,
      decisorSllUserId: item.sll.utilizador.ID_UTILIZADOR
    });

    somar(item.pessoa.perfisCriados.consultor, await atribuirBadgeDemo({
      consultor: item.pessoa.perfisCriados.consultor,
      utilizador: item.pessoa.utilizador,
      badge: item.badge,
      data: addDays(item.data, 2),
      motivo: item.motivo
    }));
  }

  await criarPedidoDemo({
    consultorUser: hugo.utilizador,
    badge: contexto.devops.badges.C,
    estado: 'Recusado',
    data: dataRelativa({ meses: -2, dias: -1 }),
    tmId: talentPrincipal.perfisCriados.talentManager.ID_TM,
    sllId: hugo.perfisCriados.sll.ID_SLL,
    decisorTmUserId: talentPrincipal.utilizador.ID_UTILIZADOR,
    decisorSllUserId: hugo.utilizador.ID_UTILIZADOR,
    comentario: 'Faltou evidência de observabilidade e métricas de operação.'
  });

  await criarPedidoDemo({
    consultorUser: sofia.utilizador,
    badge: contexto.talent.badges.B,
    estado: 'Recusado',
    data: dataRelativa({ meses: -1, dias: -20 }),
    tmId: talentPrincipal.perfisCriados.talentManager.ID_TM,
    sllId: null,
    decisorTmUserId: talentPrincipal.utilizador.ID_UTILIZADOR,
    comentario: 'O comprovativo submetido não validava autonomia no processo.'
  });

  await criarPedidoDemo({
    consultorUser: marta.utilizador,
    badge: contexto.devops.badges.D,
    estado: 'Rascunho',
    data: dataRelativa({ dias: -18 }),
    tmId: sofia.perfisCriados.talentManager.ID_TM,
    sllId: hugo.perfisCriados.sll.ID_SLL,
    decisorTmUserId: sofia.utilizador.ID_UTILIZADOR,
    decisorSllUserId: hugo.utilizador.ID_UTILIZADOR,
    comentario: 'Enviar evidência adicional sobre arquitetura do pipeline.'
  });

  await criarPedidoDemo({
    consultorUser: hugo.utilizador,
    badge: contexto.talent.badges.C,
    estado: 'Em Análise SLL',
    data: dataRelativa({ dias: -5 }),
    tmId: sofia.perfisCriados.talentManager.ID_TM,
    sllId: marta.perfisCriados.sll.ID_SLL,
    decisorTmUserId: sofia.utilizador.ID_UTILIZADOR,
    decisorSllUserId: null
  });

  await criarPedidoDemo({
    consultorUser: sofia.utilizador,
    badge: contexto.lowcode.badges.C,
    estado: 'Pendente',
    data: dataRelativa({ dias: -2 }),
    tmId: null,
    sllId: null,
    decisorTmUserId: null,
    decisorSllUserId: null
  });

  somar(hugo.perfisCriados.consultor, await atribuirMarcoDemo({
    consultor: hugo.perfisCriados.consultor,
    utilizador: hugo.utilizador,
    marco: porTituloMarco['Trilogia Técnica'],
    data: dataRelativa({ meses: -1, dias: -1 })
  }));

  somar(sofia.perfisCriados.consultor, await atribuirMarcoDemo({
    consultor: sofia.perfisCriados.consultor,
    utilizador: sofia.utilizador,
    marco: porTituloMarco['Sprint de Certificação'],
    data: dataRelativa({ dias: -22 })
  }));

  somar(marta.perfisCriados.consultor, await atribuirMarcoDemo({
    consultor: marta.perfisCriados.consultor,
    utilizador: marta.utilizador,
    marco: porTituloMarco['Trilogia Técnica'],
    data: dataRelativa({ dias: -9 })
  }));

  somar(marta.perfisCriados.consultor, await atribuirMarcoDemo({
    consultor: marta.perfisCriados.consultor,
    utilizador: marta.utilizador,
    marco: porTituloMarco['Marco de 1500 Pontos'],
    data: dataRelativa({ dias: -4 })
  }));

  for (const item of [hugo, sofia, marta]) {
    const total = totalPorConsultor.get(item.perfisCriados.consultor.ID_CONSULTOR) || 0;
    await item.perfisCriados.consultor.update({ PONTUACAO_TOTAL: total });
  }

  await ObjetivoTimeline.bulkCreate([
    {
      ID_UTILIZADOR: hugo.utilizador.ID_UTILIZADOR,
      TITULO: 'Preparar badge DevSecOps Sénior',
      DESCRICAO: 'Reunir evidências de observabilidade e melhoria operacional.',
      DATA_OBJETIVO: dataRelativa({ meses: 1 }),
      STATUS: 'Em Progresso',
      DATA_CONCLUSAO: null,
      ORIGEM: 'Service Line Leader',
      TIPO_OBJETIVO: 'Badge'
    },
    {
      ID_UTILIZADOR: sofia.utilizador.ID_UTILIZADOR,
      TITULO: 'Concluir candidatura LowCode Sénior',
      DESCRICAO: 'Validar evidências de projeto em Service Line externa.',
      DATA_OBJETIVO: dataRelativa({ dias: 25 }),
      STATUS: 'Em Progresso',
      DATA_CONCLUSAO: null,
      ORIGEM: 'Criado por mim',
      TIPO_OBJETIVO: 'Certificação'
    },
    {
      ID_UTILIZADOR: marta.utilizador.ID_UTILIZADOR,
      TITULO: 'Mentoria interna de Talent Management',
      DESCRICAO: 'Concluir sessão de partilha e documentação final.',
      DATA_OBJETIVO: dataRelativa({ dias: -10 }),
      STATUS: 'Concluído',
      DATA_CONCLUSAO: dataRelativa({ dias: -11 }),
      ORIGEM: 'Service Line Leader',
      TIPO_OBJETIVO: 'Mentoria'
    }
  ]);

  await Notificacao.bulkCreate([
    {
      ID_UTILIZADOR: hugo.utilizador.ID_UTILIZADOR,
      TITULO_NOTIFICACAO: 'Pedido em validação final',
      MENSAGEM_NOTIFICACAO: 'A candidatura ao badge Talent Management - Sénior aguarda decisão do Service Line Leader.',
      DATA_ENVIO_NOTIFICACAO: dataRelativa({ dias: -4 }),
      ESTADO_LIDO: false,
      TIPO_NOTIFICACAO: 'validacao'
    },
    {
      ID_UTILIZADOR: sofia.utilizador.ID_UTILIZADOR,
      TITULO_NOTIFICACAO: 'Nova candidatura pendente',
      MENSAGEM_NOTIFICACAO: 'Existe uma candidatura recente ao badge LowCode Sénior para acompanhar no histórico.',
      DATA_ENVIO_NOTIFICACAO: dataRelativa({ dias: -2 }),
      ESTADO_LIDO: false,
      TIPO_NOTIFICACAO: 'pedido'
    },
    {
      ID_UTILIZADOR: marta.utilizador.ID_UTILIZADOR,
      TITULO_NOTIFICACAO: 'Badge próximo da expiração',
      MENSAGEM_NOTIFICACAO: 'O badge Talent Management - Especialista tem validade curta e permite testar o fluxo de renovação.',
      DATA_ENVIO_NOTIFICACAO: dataRelativa({ dias: -1 }),
      ESTADO_LIDO: false,
      TIPO_NOTIFICACAO: 'expiracao'
    }
  ]);
};

async function seedDatabase() {
  const isSqlite = sequelize.getDialect() === 'sqlite';
  console.log(`[Seed] A inicializar base de dados limpa (${sequelize.getDialect()})...`);
  await sequelize.sync({ force: true });

  try {
    const adminUser = await criarUtilizadorBase({
      nome: 'Administrador Geral Softinsa',
      email: 'administradorgeral629@gmail.com',
      perfis: ['Administrador'],
      adminId: null,
      serviceLine: 'Global',
      area: 'Global'
    });
    const { admin } = await adicionarPerfisOperacionais({
      utilizador: adminUser,
      perfis: ['Administrador']
    });

    await ConfiguracoesSistema.create({
      MODO_MANUTENCAO: false,
      PONTOS_DEFAULT_A: 150,
      PONTOS_DEFAULT_B: 200,
      PONTOS_DEFAULT_C: 250,
      PONTOS_DEFAULT_D: 350,
      PONTOS_DEFAULT_E: 500,
      PONTOS_DEFAULT_OUTRO: 750,
      VALIDADE_MESES_PADRAO: 24,
      IDIOMA_PADRAO: 'Português (Portugal)',
      SESSAO_EXPIRACAO: '4 Horas (Padrão)',
      RETENCAO_EVIDENCIAS: '5 Anos (Recomendado)',
      GLOBAL_EMAIL: true,
      GLOBAL_PUSH: true
    });

    const learningPath = await LearningPath.create({
      ID_ADMIN: admin.ID_ADMIN,
      NOME_LEARNING_PATH: 'Jornada Técnica',
      DESCRICAO_LEARNING_PATH: 'Percurso técnico da Softinsa organizado por Service Lines, áreas de competência e níveis progressivos.',
      DATA_CRIACAO_LEARNING_PATH: DATA_BASE,
      ESTADO_ATIVO_LEARNING_PATH: true
    });

    const contexto = {};

    for (const item of estruturaBase) {
      const serviceLine = await ServiceLine.create({
        ID_ADMIN: admin.ID_ADMIN,
        ID_SLL: null,
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

      const niveis = {};
      const badges = {};
      for (const nivel of niveisBase) {
        const nivelObj = await Nivel.create({
          ID_AREA: area.ID_AREA,
          NOME_NIVEL: nivel.nome,
          ORDEM_HIERARQUICA: nivel.ordem,
          DESCRICAO_NIVEL: `Nível ${nivel.letra} - ${nivel.nome} da área ${item.area}.`
        });
        niveis[nivel.letra] = nivelObj;

        const requisitosPadrao = item.requisitosPadrao[nivel.letra] || [];
        for (let idx = 0; idx < requisitosPadrao.length; idx++) {
          await RequisitoPadrao.create({
            ID_NIVEL: nivelObj.ID_NIVEL,
            TITULO_PADRAO: `Requisito ${nivel.letra}${idx + 1}`,
            DESCRICAO_PADRAO: requisitosPadrao[idx],
            TIPO_REQUISITO_PADRAO: 'Ficheiro',
            CODIGO_REFERENCIA: `${nivel.letra}${idx + 1}`
          });
        }

        badges[nivel.letra] = await criarBadgeNormal({
          item,
          areaObj: area,
          nivelObj,
          nivel,
          adminId: admin.ID_ADMIN,
          requisitosPadraoNivel: requisitosPadrao
        });
      }

      contexto[item.chave] = { ...item, serviceLineObj: serviceLine, areaObj: area, niveis, badges };
    }

    const marcos = [];
    marcos.push(await criarBadgePremium({
      titulo: 'Trilogia Técnica',
      descricao: 'Reconhece consultores que já conquistaram três badges normais na plataforma, demonstrando consistência na evolução técnica.',
      pontos: 250,
      tipo: 'TOTAL_BADGES',
      param1: 3
    }));
    marcos.push(await criarBadgePremium({
      titulo: 'Sprint de Certificação',
      descricao: 'Valoriza consultores que mantêm ritmo de evolução e conseguem obter dois badges aprovados num intervalo curto.',
      pontos: 300,
      tipo: 'BADGES_DIAS',
      param1: 2,
      param2: 90
    }));
    marcos.push(await criarBadgePremium({
      titulo: 'Marco de 1500 Pontos',
      descricao: 'Distingue consultores que acumulam uma pontuação relevante através de badges normais e evolução continuada.',
      pontos: 450,
      tipo: 'TOTAL_PONTOS',
      param1: 1500
    }));
    marcos.push(await criarBadgePremium({
      titulo: 'Melhor Consultor de 2026',
      descricao: 'Prémio anual atribuído ao consultor com maior pontuação conquistada durante o ano civil de 2026.',
      pontos: 750,
      tipo: 'MELHOR_ANO',
      param1: 2026
    }));
    marcos.push(await criarBadgePremium({
      titulo: 'Destaque do Próximo Trimestre',
      descricao: 'Reconhece o consultor com melhor desempenho em pontos durante os próximos três meses consecutivos.',
      pontos: 600,
      tipo: 'MELHOR_MESES',
      param1: 3
    }));

    const utilizadores = [];
    const criarPessoa = async ({ nome, email, perfis, ctx, cargoSll }) => {
      const utilizador = await criarUtilizadorBase({
        nome,
        email,
        perfis,
        adminId: admin.ID_ADMIN,
        serviceLine: ctx?.serviceLine || 'Global',
        area: ctx?.area || 'Global'
      });
      const perfisCriados = await adicionarPerfisOperacionais({
        utilizador,
        perfis,
        areaObj: ctx?.areaObj || null,
        cargoSll
      });
      utilizadores.push({ utilizador, perfisCriados, ctx });
      return { utilizador, perfisCriados };
    };

    await criarPessoa({
      nome: 'Consultor LowCode',
      email: 'consultorlowcode@gmail.com',
      perfis: ['Consultor'],
      ctx: contexto.lowcode
    });

    const talentPrincipal = await criarPessoa({
      nome: 'Talent Manager Softinsa',
      email: 'talentmanager34@gmail.com',
      perfis: ['Talent Manager'],
      ctx: null
    });

    const sllHybrid = await criarPessoa({
      nome: 'SLL Hybrid Cloud',
      email: 'sllhybridcloud@gmail.com',
      perfis: ['Service Line Leader'],
      ctx: contexto.lowcode,
      cargoSll: 'Service Line Leader - Hybrid Cloud'
    });
    const { perfisCriados: hybridSllPerfis } = sllHybrid;
    await contexto.lowcode.serviceLineObj.update({ ID_SLL: hybridSllPerfis.sll.ID_SLL });

    const hugo = await criarPessoa({
      nome: 'Hugo Application Operations',
      email: 'hugo.appops@softinsa.pt',
      perfis: ['Consultor', 'Service Line Leader'],
      ctx: contexto.devops,
      cargoSll: 'Service Line Leader - Application Operations'
    });
    const { perfisCriados: appOpsPerfis } = hugo;
    await contexto.devops.serviceLineObj.update({ ID_SLL: appOpsPerfis.sll.ID_SLL });

    const sofia = await criarPessoa({
      nome: 'Sofia Talent Consultant',
      email: 'sofia.talent@softinsa.pt',
      perfis: ['Consultor', 'Talent Manager'],
      ctx: contexto.talent
    });

    const marta = await criarPessoa({
      nome: 'Marta Talent Lead',
      email: 'marta.talent.lead@softinsa.pt',
      perfis: ['Consultor', 'Talent Manager', 'Service Line Leader'],
      ctx: contexto.talent,
      cargoSll: 'Service Line Leader - Sourcing & Talent Management'
    });
    const { perfisCriados: talentSllPerfis } = marta;
    await contexto.talent.serviceLineObj.update({ ID_SLL: talentSllPerfis.sll.ID_SLL });

    await criarDemoUtilizadoresAdicionais({
      contexto,
      adicionais: { hugo, sofia, marta },
      marcos,
      talentPrincipal,
      sllHybrid
    });

    await LogAtividadeSistema.create({
      ID_UTILIZADOR: adminUser.ID_UTILIZADOR,
      TIPO_ATIVIDADE: 'Seed Inicial',
      DETALHES_ATIVIDADE: 'Criou Jornada Técnica, 3 Service Lines, 3 áreas, 15 níveis, 15 badges normais, 5 badges premium e 7 utilizadores.',
      DATA_HORA_ATIVIDADE: DATA_BASE
    });

    const totais = {
      utilizadores: await Utilizador.count(),
      learningPaths: await LearningPath.count(),
      serviceLines: await ServiceLine.count(),
      areas: await Area.count(),
      niveis: await Nivel.count(),
      requisitosPadrao: await RequisitoPadrao.count(),
      badgesNormais: await Badge.count({ where: { IS_PREMIUM: false } }),
      badgesPremium: await MarcoConquista.count()
    };

    console.log('\nSeed limpo concluído com sucesso.');
    console.table(totais);
    console.log('\nContas principais:');
    console.log('administradorgeral629@gmail.com  | Administrador');
    console.log('consultorlowcode@gmail.com       | Consultor - Hybrid Cloud / LowCode');
    console.log('talentmanager34@gmail.com        | Talent Manager');
    console.log('sllhybridcloud@gmail.com         | Service Line Leader - Hybrid Cloud');
    console.log('\nPassword de todas as contas: Softinsa@2026\n');

    if (isSqlite) {
      console.log('[Seed] SQLite pronto para desenvolvimento local.');
    }
  } catch (error) {
    console.error('Erro ao executar o seed:', error);
    throw error;
  }
}

if (require.main === module) {
  seedDatabase()
    .then(() => {
      console.log('Processo de seed terminado.');
      process.exit(0);
    })
    .catch(() => {
      process.exit(1);
    });
} else {
  module.exports = seedDatabase;
}
