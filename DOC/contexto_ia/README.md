# Índice — Contexto para IA Externa

Esta carpeta contiene todo el contexto necesario para que una IA entienda el proyecto **SAT Control Manager** sin tener que analizar el código desde cero.

## 📖 Orden de lectura recomendado

| Archivo | Contenido | Cuándo leerlo |
|---------|-----------|---------------|
| [`00_resumen_proyecto.md`](./00_resumen_proyecto.md) | Qué hace el sistema, qué está hecho, qué falta, principios de seguridad | **Primero siempre** |
| [`01_estructura_src.md`](./01_estructura_src.md) | Descripción detallada de cada archivo del backend (`src/`) | Antes de subir `src/` |
| [`02_estructura_public.md`](./02_estructura_public.md) | Descripción detallada del frontend modular (`public/`) | Antes de subir `public/` |
| [`03_archivos_raiz.md`](./03_archivos_raiz.md) | Archivos raíz, qué subir/no subir, variables de entorno | Antes de subir archivos sueltos |
| [`04_modulo_whatsapp.md`](./04_modulo_whatsapp.md) | Estado del módulo WhatsApp: qué existe vs qué falta | Cuando vayas al Paso 17 |
| [`05_instrucciones_auditoria_e_implementacion.md`](./05_instrucciones_auditoria_e_implementacion.md) | **Instrucciones completas para la IA:** auditoría + implementación WhatsApp | Para pegar en la IA |

---

## 🚀 Cómo usar estos archivos con una IA externa

### Opción A — Flujo recomendado (por partes)

1. Pega el contenido de `00_resumen_proyecto.md` como contexto inicial
2. Sube la carpeta `src/` completa + pega `01_estructura_src.md`
3. Sube la carpeta `public/` + archivos raíz sueltos + pega `02_estructura_public.md` y `03_archivos_raiz.md`
4. Pega `05_instrucciones_auditoria_e_implementacion.md` como las instrucciones de trabajo

### Opción B — Todo junto (si la IA acepta contexto largo)

Pega todos los archivos `.md` de esta carpeta en orden (00 → 05) como un solo bloque de contexto, luego sube el código.

---

## 📁 Archivos del proyecto a subir a la IA

```
✅ SUBIR:
├── src/                    (toda la carpeta — backend)
├── public/                 (toda la carpeta — frontend modular)
├── server.js               (entry point Express)
├── schema.sql              (DDL de referencia)
├── package.json            (dependencias)
└── index.html              (shell HTML de la SPA)

🚫 NO SUBIR:
├── .env                    (credenciales)
├── prueba.cer              (certificado privado)
├── node_modules/           (innecesario)
├── .git/                   (historial Git)
├── data/                   (datos reales)
└── package-lock.json       (generado automáticamente)
```

---

*Generado el 2026-08-31 — Conversación de desarrollo con Antigravity IDE*
