const crypto = require('crypto');
const fs = require('fs');
const https = require('https');
const path = require('path');

const uploadDir = path.join(__dirname, '../../uploads');

const isCloudinaryConfigured = () => Boolean(
    process.env.CLOUDINARY_CLOUD_NAME &&
    process.env.CLOUDINARY_API_KEY &&
    process.env.CLOUDINARY_API_SECRET
);

const getApiOrigin = (req) => (
    process.env.PUBLIC_API_URL ||
    process.env.BACKEND_URL ||
    `${String(req?.get?.('x-forwarded-proto') || req?.protocol || 'http').split(',')[0]}://${req.get('host')}`
).replace(/\/$/, '');

const sanitizeFilename = (name = 'ficheiro') => {
    const parsed = path.parse(String(name).replace(/\\/g, '/').split('/').pop() || 'ficheiro');
    const base = parsed.name
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-zA-Z0-9_-]/g, '_')
        .replace(/_+/g, '_')
        .replace(/^_+|_+$/g, '')
        .slice(0, 80) || 'ficheiro';
    const ext = parsed.ext.replace(/[^a-zA-Z0-9.]/g, '').slice(0, 12);
    return `${base}${ext}`;
};

const extensionFromMime = (mime = '') => {
    if (mime.includes('svg')) return '.svg';
    if (mime.includes('png')) return '.png';
    if (mime.includes('jpeg') || mime.includes('jpg')) return '.jpg';
    if (mime.includes('webp')) return '.webp';
    if (mime.includes('gif')) return '.gif';
    if (mime.includes('pdf')) return '.pdf';
    return '';
};

const chooseResourceType = (mimetype = '', requested = 'auto') => {
    if (requested && requested !== 'auto') return requested;
    if (String(mimetype).startsWith('image/')) return 'image';
    return 'raw';
};

const withMimeExtension = (name, mimetype) => {
    const ext = extensionFromMime(mimetype);
    if (!ext) return name;
    const currentExt = path.extname(String(name || ''));
    return currentExt ? name : `${name}${ext}`;
};

const saveLocalBuffer = async (req, buffer, originalname, { absolute = false } = {}) => {
    if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
    const filename = `${Date.now()}-${Math.round(Math.random() * 1e9)}-${sanitizeFilename(originalname)}`;
    fs.writeFileSync(path.join(uploadDir, filename), buffer);
    const relative = `/uploads/${filename}`;
    return { url: absolute ? `${getApiOrigin(req)}${relative}` : relative, filename, provider: 'local' };
};

const cloudinarySignature = (params) => {
    const payload = Object.keys(params).sort().map(key => `${key}=${params[key]}`).join('&');
    return crypto.createHash('sha1').update(`${payload}${process.env.CLOUDINARY_API_SECRET}`).digest('hex');
};

const appendField = (chunks, boundary, name, value) => {
    chunks.push(Buffer.from(`--${boundary}\r\n`));
    chunks.push(Buffer.from(`Content-Disposition: form-data; name="${name}"\r\n\r\n`));
    chunks.push(Buffer.from(`${value}\r\n`));
};

const appendFile = (chunks, boundary, buffer, filename, contentType) => {
    chunks.push(Buffer.from(`--${boundary}\r\n`));
    chunks.push(Buffer.from(`Content-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: ${contentType || 'application/octet-stream'}\r\n\r\n`));
    chunks.push(buffer);
    chunks.push(Buffer.from('\r\n'));
};

const uploadToCloudinary = ({ buffer, originalname, mimetype, folder, resourceType = 'auto' }) => {
    resourceType = chooseResourceType(mimetype, resourceType);
    originalname = withMimeExtension(originalname, mimetype);
    const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
    const timestamp = Math.floor(Date.now() / 1000);
    const params = { folder, timestamp };
    const signature = cloudinarySignature(params);
    const boundary = `----softinsa-${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    const filename = sanitizeFilename(originalname);
    const chunks = [];

    appendFile(chunks, boundary, buffer, filename, mimetype);
    appendField(chunks, boundary, 'api_key', process.env.CLOUDINARY_API_KEY);
    appendField(chunks, boundary, 'timestamp', timestamp);
    appendField(chunks, boundary, 'folder', folder);
    appendField(chunks, boundary, 'signature', signature);
    chunks.push(Buffer.from(`--${boundary}--\r\n`));

    const body = Buffer.concat(chunks);
    return new Promise((resolve, reject) => {
        const req = https.request({
            method: 'POST',
            hostname: 'api.cloudinary.com',
            path: `/v1_1/${encodeURIComponent(cloudName)}/${resourceType}/upload`,
            headers: { 'Content-Type': `multipart/form-data; boundary=${boundary}`, 'Content-Length': body.length }
        }, (res) => {
            const parts = [];
            res.on('data', chunk => parts.push(chunk));
            res.on('end', () => {
                const text = Buffer.concat(parts).toString('utf8');
                let data;
                try { data = JSON.parse(text); } catch (_) { return reject(new Error(`Resposta invalida da Cloudinary: ${text}`)); }
                if (res.statusCode >= 200 && res.statusCode < 300) {
                    console.log('[Uploads] Cloudinary OK:', { publicId: data.public_id, resourceType: data.resource_type, url: data.secure_url || data.url });
                    return resolve({ url: data.secure_url || data.url, filename, publicId: data.public_id, provider: 'cloudinary', resourceType: data.resource_type });
                }
                console.error('[Uploads] Cloudinary erro:', { statusCode: res.statusCode, body: data });
                reject(new Error(data.error?.message || `Erro Cloudinary ${res.statusCode}`));
            });
        });
        req.on('error', reject);
        req.write(body);
        req.end();
    });
};

const uploadBuffer = async (req, buffer, options = {}) => {
    // Compatibilidade com chamadas antigas: uploadBuffer(buffer, options).
    if (Buffer.isBuffer(req) || req instanceof Uint8Array) {
        options = buffer || {};
        buffer = Buffer.from(req);
        req = null;
    }
    let { originalname = 'ficheiro', mimetype = 'application/octet-stream', folder = 'softinsa/ficheiros', absoluteLocalUrl = false, resourceType = 'auto' } = options;
    resourceType = chooseResourceType(mimetype, resourceType);
    originalname = withMimeExtension(originalname, mimetype);
    if (!buffer) throw new Error('Ficheiro vazio.');
    if (!isCloudinaryConfigured()) {
        console.warn('[Uploads] Cloudinary nao configurado. A usar fallback local para', originalname);
        return saveLocalBuffer(req, buffer, originalname, { absolute: absoluteLocalUrl });
    }
    console.log('[Uploads] A enviar para Cloudinary:', { folder, originalname, mimetype, bytes: buffer.length });
    return uploadToCloudinary({ buffer, originalname, mimetype, folder, resourceType });
};

const uploadMulterFile = (req, file, options = {}) => {
    if (!file?.buffer) throw new Error('Ficheiro enviado sem conteudo em memoria.');
    return uploadBuffer(req, file.buffer, { originalname: file.originalname, mimetype: file.mimetype, ...options });
};

const isImageMime = (mimetype = '') => String(mimetype || '').toLowerCase().startsWith('image/');

const createEvidenceEnvelope = ({ buffer, originalname, mimetype }) => Buffer.from(
    `SOFTINSA_FILE_V1\n${JSON.stringify({
        originalname: String(originalname || 'ficheiro'),
        mimetype: String(mimetype || 'application/octet-stream'),
        data: Buffer.from(buffer).toString('base64')
    })}`,
    'utf8'
);

const uploadEvidenceBuffer = async (req, buffer, options = {}) => {
    const originalname = options.originalname || 'ficheiro';
    const mimetype = options.mimetype || 'application/octet-stream';

    if (isImageMime(mimetype)) {
        return uploadBuffer(req, buffer, { ...options, resourceType: options.resourceType || 'auto' });
    }

    const envelope = createEvidenceEnvelope({ buffer, originalname, mimetype });
    return uploadBuffer(req, envelope, {
        ...options,
        originalname: `${sanitizeFilename(originalname)}.softinsa.txt`,
        mimetype: 'text/plain; charset=utf-8',
        resourceType: 'raw'
    });
};

const uploadEvidenceMulterFile = (req, file, options = {}) => {
    if (!file?.buffer) throw new Error('Ficheiro enviado sem conteudo em memoria.');
    return uploadEvidenceBuffer(req, file.buffer, {
        originalname: file.originalname,
        mimetype: file.mimetype,
        ...options
    });
};

const uploadDataUri = async (req, dataUri, options = {}) => {
    const match = String(dataUri || '').match(/^data:([^;]+);base64,(.+)$/);
    if (!match) throw new Error('Imagem base64 invalida.');
    const mimetype = match[1];
    const ext = extensionFromMime(mimetype) || '.bin';
    return uploadBuffer(req, Buffer.from(match[2], 'base64'), { ...options, originalname: withMimeExtension(options.originalname || `imagem_${Date.now()}${ext}`, mimetype), mimetype, resourceType: chooseResourceType(mimetype, options.resourceType || 'auto') });
};

module.exports = {
    getApiOrigin,
    isCloudinaryConfigured,
    sanitizeFilename,
    uploadBuffer,
    uploadDataUri,
    uploadMulterFile,
    uploadEvidenceBuffer,
    uploadEvidenceMulterFile
};
