// ============================================================
// Versión: v2.2.1
// Archivo: src/utils/crypto.js
// Descripción: Cifrado simétrico REAL (AES-256-GCM) para secretos
// del servidor en reposo (credenciales SMTP, token de WhatsApp, etc.).
// Sustituye la codificación Base64 previa, que no ofrecía ninguna
// protección real (hallazgo QA ALTA - alertas.js).
//
// Requiere la variable de entorno ENCRYPTION_KEY: una cadena de
// 32 bytes (256 bits) en formato hexadecimal (64 caracteres hex).
// Generarla una sola vez, por ejemplo con:
//   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
// y guardarla ÚNICAMENTE en el .env del servidor (nunca en el repo).
// ============================================================

'use strict';

const crypto = require('crypto');

const ALGORITMO = 'aes-256-gcm';
const IV_BYTES = 12;   // recomendado por NIST para GCM

/**
 * Obtiene y valida la llave maestra de cifrado desde el entorno.
 * Falla rápido y con un mensaje claro si no está configurada o
 * no tiene la longitud correcta, en vez de cifrar con una llave débil.
 * @returns {Buffer} Llave de 32 bytes
 */
function obtenerLlaveMaestra() {
    const llaveHex = process.env.ENCRYPTION_KEY;
    if (!llaveHex) {
        throw new Error(
            'ENCRYPTION_KEY no está configurada en las variables de entorno. ' +
            'Genera una con: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"'
        );
    }
    const llave = Buffer.from(llaveHex, 'hex');
    if (llave.length !== 32) {
        throw new Error('ENCRYPTION_KEY inválida: se esperaban 32 bytes (64 caracteres hexadecimales).');
    }
    return llave;
}

/**
 * Cifra un texto plano con AES-256-GCM.
 * @param {string} textoPlano
 * @returns {string} Payload JSON serializado: { iv, tag, ciphertext } (todo en hex)
 */
function cifrar(textoPlano) {
    if (textoPlano === null || textoPlano === undefined || textoPlano === '') {
        return null;
    }
    const llave = obtenerLlaveMaestra();
    const iv = crypto.randomBytes(IV_BYTES);
    const cipher = crypto.createCipheriv(ALGORITMO, llave, iv);

    const ciphertext = Buffer.concat([cipher.update(String(textoPlano), 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();

    return JSON.stringify({
        iv: iv.toString('hex'),
        tag: tag.toString('hex'),
        ciphertext: ciphertext.toString('hex')
    });
}

/**
 * Descifra un payload generado por cifrar(). Verifica el tag de
 * autenticidad (GCM); si el dato fue alterado, lanza un error en
 * vez de devolver texto corrupto silenciosamente.
 * @param {string} payloadCifrado - JSON serializado { iv, tag, ciphertext }
 * @returns {string|null}
 */
function descifrar(payloadCifrado) {
    if (!payloadCifrado) return null;

    let iv, tag, ciphertext;
    try {
        ({ iv, tag, ciphertext } = JSON.parse(payloadCifrado));
    } catch (e) {
        throw new Error('Payload cifrado con formato inválido (se esperaba JSON {iv, tag, ciphertext}).');
    }

    const llave = obtenerLlaveMaestra();
    const decipher = crypto.createDecipheriv(ALGORITMO, llave, Buffer.from(iv, 'hex'));
    decipher.setAuthTag(Buffer.from(tag, 'hex'));

    const textoPlano = Buffer.concat([
        decipher.update(Buffer.from(ciphertext, 'hex')),
        decipher.final()
    ]);

    return textoPlano.toString('utf8');
}

module.exports = { cifrar, descifrar };
