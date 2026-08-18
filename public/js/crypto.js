// ============================================================
// Versión: v2.2.3
// Archivo: public/js/crypto.js
// Descripción: Funciones criptográficas del lado del cliente (Web Crypto API)
//              para cifrado AES-GCM-256 + PBKDF2 de llaves privadas (.key).
// ============================================================

// Cifra localmente la llave privada con AES-GCM usando una llave derivada de la contraseña
async function cifrarClaveLocal(fileData, password) {
    try {
        const encoder = new TextEncoder();
        const passwordBuffer = encoder.encode(password);

        // Generar un Salt aleatorio (16 bytes)
        const salt = window.crypto.getRandomValues(new Uint8Array(16));

        // Derivar clave de cifrado simétrico mediante PBKDF2
        const baseKey = await window.crypto.subtle.importKey(
            'raw', passwordBuffer, { name: 'PBKDF2' }, false, ['deriveKey']
        );

        const aesKey = await window.crypto.subtle.deriveKey(
            {
                name: 'PBKDF2',
                salt: salt,
                iterations: 100000,
                hash: 'SHA-256'
            },
            baseKey,
            { name: 'AES-GCM', length: 256 },
            false,
            ['encrypt']
        );

        // Generar Vector de Inicialización (IV) de 12 bytes
        const iv = window.crypto.getRandomValues(new Uint8Array(12));

        // Convertir los datos del archivo en un ArrayBuffer
        const dataBuffer = typeof fileData === 'string'
            ? encoder.encode(fileData)
            : await fileData.arrayBuffer();

        // Cifrar con AES-GCM
        const encryptedBuffer = await window.crypto.subtle.encrypt(
            { name: 'AES-GCM', iv: iv },
            aesKey,
            dataBuffer
        );

        // El buffer encriptado contiene el texto cifrado + la etiqueta de autenticación (Tag) al final
        const totalBytes = new Uint8Array(encryptedBuffer);
        const tagLength = 16; // AES-GCM usa tag de 16 bytes por defecto
        const ciphertextBytes = totalBytes.slice(0, totalBytes.length - tagLength);
        const tagBytes = totalBytes.slice(totalBytes.length - tagLength);

        // Retornar payload serializado en Base64
        return JSON.stringify({
            iv: btoa(String.fromCharCode(...iv)),
            salt: btoa(String.fromCharCode(...salt)),
            ciphertext: btoa(String.fromCharCode(...ciphertextBytes)),
            tag: btoa(String.fromCharCode(...tagBytes))
        });
    } catch (err) {
        console.error('[Crypto Client] Error en cifrado:', err);
        throw new Error('Error al cifrar la clave privada localmente.');
    }
}

// Convierte un File a una cadena base64 (para enviar el .cer público al backend)
function fileToBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result.split(',')[1]);
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}
