// ============================================================
// Versión: v2.2.0
// Archivo: src/utils/semaforo.js
// Descripción: Lógica del motor semafórico con umbrales precisos
// calculados en UTC 00:00 según especificación v1.1 (CU-02).
// Verde > 90d | Amarillo 31-90d | Rojo 1-30d | Expirado ≤ 0d
// ============================================================

'use strict';

/**
 * Calcula los días restantes y el estatus semafórico de un certificado.
 * El cálculo se realiza en UTC para evitar desfases de zona horaria.
 * @param {string} fecha_vencimiento - Formato YYYY-MM-DD
 * @param {object} config - Umbrales de la tabla alertas_config
 * @returns {{ dias_restantes: number, estatus: string, color: string }}
 */
function calcularEstatus(fecha_vencimiento, config = {}) {
    const umbralCritico    = config.umbral_critico_dias    || 30;
    const umbralPreventivo = config.umbral_preventivo_dias || 90;

    // Fecha de hoy a las 00:00:00 UTC (comparación normalizada)
    const hoyUTC = new Date();
    hoyUTC.setUTCHours(0, 0, 0, 0);

    const vencimientoUTC = new Date(fecha_vencimiento + 'T00:00:00Z');
    const diffMs = vencimientoUTC - hoyUTC;
    const dias_restantes = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    let estatus, color;

    if (dias_restantes <= 0) {
        estatus = 'expirado';
        color   = '#1a1a1a'; // Negro
    } else if (dias_restantes <= umbralCritico) {
        estatus = 'critico';
        color   = '#ef4444'; // Rojo
    } else if (dias_restantes <= umbralPreventivo) {
        estatus = 'preventivo';
        color   = '#f59e0b'; // Amarillo
    } else {
        estatus = 'vigente';
        color   = '#10b981'; // Verde
    }

    return { dias_restantes, estatus, color };
}

/**
 * Recalcula el estatus de todos los contribuyentes de la BD.
 * Diseñado para ejecutarse en el cronjob nocturno a las 00:00 UTC.
 * @param {object} db - Instancia de better-sqlite3
 */
function recalcularTodos(db) {
    const config = db.prepare('SELECT * FROM alertas_config WHERE id = 1').get() || {};
    const contribuyentes = db.prepare('SELECT id, fecha_vencimiento FROM contribuyentes').all();

    const actualizar = db.prepare(
        'UPDATE contribuyentes SET estatus = ?, dias_restantes = ?, actualizado_en = ? WHERE id = ?'
    );

    const transaccion = db.transaction(() => {
        let actualizados = 0;
        for (const c of contribuyentes) {
            const { dias_restantes, estatus } = calcularEstatus(c.fecha_vencimiento, config);
            actualizar.run(estatus, dias_restantes, Math.floor(Date.now() / 1000), c.id);
            actualizados++;
        }
        return actualizados;
    });

    return transaccion();
}

module.exports = { calcularEstatus, recalcularTodos };
