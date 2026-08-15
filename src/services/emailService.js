const nodemailer = require('nodemailer');
require('dotenv').config();

/**
 * Crea o recupera un transporte de nodemailer configurado.
 * Usa credenciales en .env o genera un fallback a Ethereal (para pruebas locales).
 */
async function getTransporter() {
    if (process.env.SMTP_HOST && process.env.SMTP_USER) {
        // Usa configuración SMTP del .env
        return nodemailer.createTransport({
            host: process.env.SMTP_HOST,
            port: parseInt(process.env.SMTP_PORT) || 587,
            secure: process.env.SMTP_SECURE === 'true',
            auth: {
                user: process.env.SMTP_USER,
                pass: process.env.SMTP_PASS
            },
            tls: {
                rejectUnauthorized: false
            }
        });
    }

    // Fallback: Genera una cuenta de prueba de Ethereal al vuelo (ideal para desarrollo/pruebas sin configurar email real)
    const testAccount = await nodemailer.createTestAccount();
    console.log(`[Email Service] Usando Ethereal Account para pruebas: ${testAccount.user}`);
    
    return nodemailer.createTransport({
        host: "smtp.ethereal.email",
        port: 587,
        secure: false,
        auth: {
            user: testAccount.user,
            pass: testAccount.pass
        },
        tls: {
            rejectUnauthorized: false
        }
    });
}

/**
 * Envia el enlace temporal de descarga por correo.
 */
async function enviarEnlaceTemporal({ emailDestino, rfc, razonSocial, fileType, downloadUrl, expiresAt }) {
    try {
        const transporter = await getTransporter();
        
        let fileTypeName = '';
        if (fileType === 'CER') fileTypeName = 'Certificado Público (.cer)';
        else if (fileType === 'KEY') fileTypeName = 'Clave Privada Cifrada (.key)';
        else if (fileType === 'ZIP') fileTypeName = 'Paquete Completo (.zip)';

        const senderEmail = process.env.EMAIL_FROM || '"SAT Control Manager" <no-reply@satcontrol.local>';

        const htmlTemplate = `
        <!DOCTYPE html>
        <html lang="es">
        <head>
            <meta charset="UTF-8">
            <style>
                body {
                    font-family: 'Inter', Arial, sans-serif;
                    background-color: #f4f7f6;
                    color: #333333;
                    padding: 20px;
                }
                .container {
                    background-color: #ffffff;
                    border-radius: 8px;
                    padding: 30px;
                    max-width: 600px;
                    margin: 0 auto;
                    box-shadow: 0 4px 6px rgba(0,0,0,0.1);
                }
                .header {
                    text-align: center;
                    border-bottom: 1px solid #eeeeee;
                    padding-bottom: 20px;
                    margin-bottom: 20px;
                }
                .header h1 {
                    color: #1e293b;
                    margin: 0;
                    font-size: 24px;
                }
                .content {
                    line-height: 1.6;
                }
                .data-box {
                    background-color: #f8fafc;
                    border-left: 4px solid #3b82f6;
                    padding: 15px;
                    margin: 20px 0;
                    border-radius: 4px;
                }
                .btn {
                    display: block;
                    width: 250px;
                    margin: 30px auto;
                    padding: 15px;
                    background-color: #3b82f6;
                    color: #ffffff;
                    text-align: center;
                    text-decoration: none;
                    border-radius: 6px;
                    font-weight: bold;
                    font-size: 16px;
                }
                .btn:hover {
                    background-color: #2563eb;
                }
                .footer {
                    text-align: center;
                    font-size: 12px;
                    color: #94a3b8;
                    margin-top: 30px;
                    border-top: 1px solid #eeeeee;
                    padding-top: 20px;
                }
                .warning {
                    color: #ef4444;
                    font-size: 13px;
                    font-weight: 600;
                    text-align: center;
                    margin-top: 20px;
                }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <h1>SAT Control Manager</h1>
                </div>
                <div class="content">
                    <p>Hola,</p>
                    <p>Se ha generado un enlace de descarga seguro para los archivos de e.Firma asociados al siguiente contribuyente:</p>
                    
                    <div class="data-box">
                        <strong>Razón Social:</strong> ${razonSocial}<br>
                        <strong>RFC:</strong> ${rfc}<br>
                        <strong>Tipo de Archivo:</strong> ${fileTypeName}
                    </div>

                    <p>Para descargar los archivos, haz clic en el siguiente botón:</p>
                    <a href="${downloadUrl}" class="btn" style="color: #ffffff;">Descargar Archivos</a>

                    <div class="warning">
                        ⚠️ AVISO DE SEGURIDAD ⚠️<br>
                        Este enlace es de único uso. Se autodestruirá inmediatamente después de la primera descarga exitosa o expirará el <strong>${new Date(expiresAt).toLocaleString('es-MX')}</strong>.
                    </div>
                </div>
                <div class="footer">
                    Este es un correo automático generado por SAT Control Manager. No responda a este mensaje.
                </div>
            </div>
        </body>
        </html>
        `;

        const info = await transporter.sendMail({
            from: senderEmail,
            to: emailDestino,
            subject: `Archivos de e.Firma disponibles - ${rfc}`,
            html: htmlTemplate
        });

        // Comprueba si se está usando una cuenta Ethereal para retornar la URL de previsualización
        const previewUrl = nodemailer.getTestMessageUrl(info);
        
        return {
            success: true,
            previewUrl: previewUrl ? previewUrl : null,
            messageId: info.messageId
        };

    } catch (error) {
        console.error('[Email Service] Error enviando correo:', error);
        return {
            success: false,
            error: error.message
        };
    }
}

module.exports = {
    enviarEnlaceTemporal
};
