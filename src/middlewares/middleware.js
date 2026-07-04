const jwt = require('jsonwebtoken');
const config = require('../config');

let checkToken = (req, res, next) => {
    let token = req.headers['x-access-token'] || req.headers['authorization'];
    
    if (token && token.startsWith('Bearer ')) {
        token = token.slice(7, token.length); // remove a palavra 'Bearer '
    }
    
    if (token) {
        jwt.verify(token, config.jwtSecret, (err, decoded) => {
            if (err) {
                return res.status(401).json({
                    success: false,
                    message: 'O token não é válido.'
                });
            } else {
                req.decoded = decoded;
                req.userId = decoded.id;
                req.userRole = decoded.role;
                next();
            }
        });
    } else {
        return res.status(401).json({
            success: false,
            message: 'Token indisponível.'
        });
    }
};

const requireProfile = (...allowedProfiles) => (req, res, next) => {
    const perfis = String(req.userRole || '')
        .split('/')
        .map(perfil => perfil.trim().toLowerCase())
        .filter(Boolean);
    const permitidos = allowedProfiles.map(perfil => perfil.trim().toLowerCase());
    const autorizado = perfis.some(perfil =>
        permitidos.some(permitido =>
            perfil === permitido ||
            (permitido === 'sll' && perfil === 'service line leader') ||
            (permitido === 'service line leader' && perfil === 'sll')
        )
    );
    if (!autorizado) {
        return res.status(403).json({
            success: false,
            message: 'Não tem permissões para aceder a esta funcionalidade.'
        });
    }
    next();
};

module.exports = {
    checkToken,
    requireProfile
};
