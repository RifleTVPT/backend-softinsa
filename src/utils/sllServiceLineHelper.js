const Utilizador = require('../models/Utilizador');
const ServiceLineLeader = require('../models/ServiceLineLeader');
const ServiceLine = require('../models/ServiceLine');

const valorValido = valor => valor && valor !== 'Indefinida' && valor !== 'N/A';

const obterServiceLineSLL = async (idUtilizador, fallback = null) => {
    if (idUtilizador) {
        const utilizador = await Utilizador.findByPk(idUtilizador);
        if (valorValido(utilizador?.SL_REGISTO)) return utilizador.SL_REGISTO;

        const sll = await ServiceLineLeader.findOne({
            where: { ID_UTILIZADOR: idUtilizador }
        });
        if (sll) {
            const serviceLine = await ServiceLine.findOne({
                where: { ID_SLL: sll.ID_SLL, ESTADO_ATIVO_SERVICE_LINE: true }
            });
            if (serviceLine?.NOME_SERVICE_LINE) return serviceLine.NOME_SERVICE_LINE;
        }
    }

    return valorValido(fallback) ? fallback : null;
};

module.exports = { obterServiceLineSLL };
