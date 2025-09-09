// index.js
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const { Pool } = require('pg');

const app = express();
const port = process.env.PORT || 4000;

// Middlewares
app.use(cors()); // en producción ajusta origin
app.use(express.json({ limit: '10mb' })); // aceptamos resultados grandes

// Servir frontend estático desde /public
const publicDir = path.join(__dirname, 'public');
app.use(express.static(publicDir));

// Pool Postgres: usa DATABASE_URL si está, si no usa variables individuales
let pool;
if (process.env.DATABASE_URL) {
  pool = new Pool({ connectionString: process.env.DATABASE_URL });
} else {
  pool = new Pool({
    host: process.env.PGHOST || 'localhost',
    port: process.env.PGPORT ? parseInt(process.env.PGPORT) : 5432,
    user: process.env.PGUSER || 'postgres',
    password: process.env.PGPASSWORD || '',
    database: process.env.PGDATABASE || 'postgres',
    max: 10
  });
}

pool.on('error', (err) => {
  console.error('Unexpected PG client error', err);
});

// Health check
app.get('/api/health', (req, res) => res.json({ ok: true, uptime: process.uptime() }));

// Insertar entry
app.post('/api/entries', async (req, res) => {
  try {
    const {
      client_name, client_address, environment,
      pressure, oil_type, min_barrels, max_barrels, test_duration,
      results, params, created_at
    } = req.body;

    const created = created_at || new Date().toISOString();

    const query = `
      INSERT INTO entries
      (client_name, client_address, environment, pressure, oil_type, min_barrels, max_barrels, test_duration, results, params, created_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10::jsonb,$11)
      RETURNING id;
    `;
    const values = [
      client_name, client_address, environment,
      pressure, oil_type, min_barrels, max_barrels, test_duration,
      JSON.stringify(results), JSON.stringify(params), created
    ];

    const { rows } = await pool.query(query, values);
    console.log('Inserted entry id:', rows[0].id);
    res.status(201).json({ ok: true, id: rows[0].id });
  } catch (err) {
    console.error('POST /api/entries error:', err);
    res.status(500).json({ ok: false, error: 'Error al insertar entry' });
  }
});

// Export dump (Postgres / MySQL)
app.get('/api/entries/export', async (req, res) => {
  try {
    const type = (req.query.type || 'postgres').toLowerCase();
    const { rows } = await pool.query('SELECT * FROM entries ORDER BY created_at ASC;');
    if (!rows.length) return res.status(404).send('No hay registros para exportar.');

    const header = `-- Export generado por Sistema de Inventariado Inteligente\n-- Fecha: ${new Date().toISOString()}\n\n`;

    if (type === 'mysql') {
      const createTable = `
CREATE TABLE IF NOT EXISTS entries (
  id INT AUTO_INCREMENT PRIMARY KEY,
  client_name TEXT NOT NULL,
  client_address TEXT,
  environment VARCHAR(64),
  pressure INT,
  oil_type VARCHAR(64),
  min_barrels INT,
  max_barrels INT,
  test_duration INT,
  results JSON,
  params JSON,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;\n\n`;
      const inserts = rows.map(r => {
        const client = (r.client_name||'').replace(/\\/g,'\\\\').replace(/'/g,"''");
        const addr = (r.client_address||'').replace(/\\/g,'\\\\').replace(/'/g,"''");
        const env = (r.environment||'').replace(/\\/g,'\\\\').replace(/'/g,"''");
        const pressure = r.pressure === null ? 'NULL' : r.pressure;
        const oil = (r.oil_type||'').replace(/\\/g,'\\\\').replace(/'/g,"''");
        const minb = r.min_barrels === null ? 'NULL' : r.min_barrels;
        const maxb = r.max_barrels === null ? 'NULL' : r.max_barrels;
        const td = r.test_duration === null ? 'NULL' : r.test_duration;
        const resultsJSON = (r.results) ? JSON.stringify(r.results).replace(/\\/g,'\\\\').replace(/'/g,"''") : '{}';
        const paramsJSON  = (r.params) ? JSON.stringify(r.params).replace(/\\/g,'\\\\').replace(/'/g,"''") : '{}';
        const created = (r.created_at || new Date()).toISOString();
        return `INSERT INTO entries (client_name, client_address, environment, pressure, oil_type, min_barrels, max_barrels, test_duration, results, params, created_at)\nVALUES ('${client}','${addr}','${env}',${pressure},'${oil}',${minb},${maxb},${td},'${resultsJSON}','${paramsJSON}','${created}');\n`;
      }).join('\n');

      const content = header + createTable + inserts;
      res.setHeader('Content-Disposition', `attachment; filename=inventario_backup_mysql_${new Date().toISOString().slice(0,10)}.sql`);
      res.type('text/sql').send(content);
      return;
    }

    // Postgres dump
    const createTable = `
CREATE TABLE IF NOT EXISTS entries (
  id SERIAL PRIMARY KEY,
  client_name TEXT NOT NULL,
  client_address TEXT,
  environment TEXT,
  pressure INTEGER,
  oil_type TEXT,
  min_barrels INTEGER,
  max_barrels INTEGER,
  test_duration INTEGER,
  results JSONB NOT NULL,
  params JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);\n\n`;

    const inserts = rows.map(r => {
      const client = (r.client_name||'').replace(/\\/g,'\\\\').replace(/'/g,"''");
      const addr   = (r.client_address||'').replace(/\\/g,'\\\\').replace(/'/g,"''");
      const env    = (r.environment||'').replace(/\\/g,'\\\\').replace(/'/g,"''");
      const pressure = (r.pressure === null || r.pressure === undefined) ? 'NULL' : r.pressure;
      const oil = (r.oil_type||'').replace(/\\/g,'\\\\').replace(/'/g,"''");
      const minb = (r.min_barrels === null || r.min_barrels === undefined) ? 'NULL' : r.min_barrels;
      const maxb = (r.max_barrels === null || r.max_barrels === undefined) ? 'NULL' : r.max_barrels;
      const td   = (r.test_duration === null || r.test_duration === undefined) ? 'NULL' : r.test_duration;
      const resultsJSON = (r.results) ? JSON.stringify(r.results).replace(/\\/g,'\\\\').replace(/'/g,"''") : '{}';
      const paramsJSON  = (r.params) ? JSON.stringify(r.params).replace(/\\/g,'\\\\').replace(/'/g,"''") : '{}';
      const created    = (r.created_at || new Date()).toISOString();
      return `INSERT INTO entries (client_name, client_address, environment, pressure, oil_type, min_barrels, max_barrels, test_duration, results, params, created_at)\nVALUES ('${client}', '${addr}', '${env}', ${pressure}, '${oil}', ${minb}, ${maxb}, ${td}, '${resultsJSON}'::jsonb, '${paramsJSON}'::jsonb, '${created}');\n`;
    }).join('\n');

    const content = header + createTable + inserts;
    res.setHeader('Content-Disposition', `attachment; filename=inventario_backup_postgres_${new Date().toISOString().slice(0,10)}.sql`);
    res.type('text/sql').send(content);

  } catch (err) {
    console.error('GET /api/entries/export error:', err);
    res.status(500).send('Error generando export.');
  }
});

// Vaciar tabla (TRUNCATE) — proteger en producción
app.delete('/api/entries', async (req, res) => {
  try {
    await pool.query('TRUNCATE entries RESTART IDENTITY;');
    res.json({ ok: true, message: 'Tabla entries vaciada' });
  } catch (err) {
    console.error('DELETE /api/entries error:', err);
    res.status(500).json({ ok: false, error: 'No se pudo vaciar tabla' });
  }
});

// Solo si quieres que cualquier ruta "desconocida" muestre tu index.html
app.use((req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});


// Start
app.listen(port, () => console.log(`API + static server running on http://localhost:${port}`));
