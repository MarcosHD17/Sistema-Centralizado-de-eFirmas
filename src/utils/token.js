'use strict';

const crypto = require('crypto');

/**
 * Genera un token seguro y único utilizando entropía de 32 bytes.
 * @returns {string} Token en formato hexadecimal (64 caracteres)
 */
function generarTokenSeguro() {
    return crypto.randomBytes(32).toString('hex');
}

/**
 * Calcula el hash SHA-256 de un token para almacenamiento seguro en BD.
 * @param {string} token - Token original
 * @returns {string} Hash SHA-256 en formato hexadecimal
 */
function hashToken(token) {
    if (!token) throw new Error('Se requiere un token para hashear');
    return crypto.createHash('sha256').update(token, 'utf8').digest('hex');
}

/**
 * Calcula la fecha de expiración sumando los minutos al tiempo actual.
 * @param {number} ttlEnMinutos - Tiempo de vida en minutos
 * @returns {string} Fecha de expiración en formato ISO / SQLite DATETIME (YYYY-MM-DD HH:MM:SS)
 */
function calcularExpiracion(ttlEnMinutos) {
    if (!ttlEnMinutos || isNaN(ttlEnMinutos)) {
        throw new Error('ttlEnMinutos debe ser un número válido');
    }
    const fecha = new Date();
    fecha.setMinutes(fecha.getMinutes() + ttlEnMinutos);
    // Formato SQLite compatible: YYYY-MM-DD HH:MM:SS
    return fecha.toISOString().replace('T', ' ').substring(0, 19);
}

module.exports = {
    generarTokenSeguro,
    hashToken,
    calcularExpiracion
};
