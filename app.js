const express = require('express');
const bodyParser = require('body-parser');
const { Client } = require('pg');
const bcrypt = require('bcryptjs');
const PDFDocument = require('pdfkit');
const path = require('path');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 3000;

// Configurações
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Conexão com o PostgreSQL
const client = new Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

client.connect()
  .then(() => console.log('Conectado ao PostgreSQL'))
  .catch(err => console.error('Erro ao conectar ao PostgreSQL', err));

// Criar tabelas (se não existirem)
const createTables = async () => {
  await client.query(`
    CREATE TABLE IF NOT EXISTS funcionarios (
      id SERIAL PRIMARY KEY,
      nome TEXT NOT NULL,
      horas_extras INTEGER DEFAULT 0,
      horas_folga INTEGER DEFAULT 0
    )
  `);

  await client.query(`
    CREATE TABLE IF NOT EXISTS usuarios (
      id SERIAL PRIMARY KEY,
      username TEXT NOT NULL UNIQUE,
      password TEXT NOT NULL
    )
  `);
};

createTables();

// Rotas
app.get('/', (req, res) => {
  res.render('index');
});

app.get('/login', (req, res) => {
  res.render('login');
});

app.post('/login', async (req, res) => {
  const { username, password } = req.body;
  const result = await client.query('SELECT * FROM usuarios WHERE username = $1', [username]);
  const user = result.rows[0];

  if (!user || !bcrypt.compareSync(password, user.password)) {
    return res.status(401).send('Credenciais inválidas');
  }
  res.redirect('/');
});

app.get('/funcionarios', async (req, res) => {
  const result = await client.query('SELECT * FROM funcionarios');
  res.render('funcionarios', { funcionarios: result.rows });
});

app.post('/funcionarios', async (req, res) => {
  const { nome } = req.body;
  await client.query('INSERT INTO funcionarios (nome) VALUES ($1)', [nome]);
  res.redirect('/funcionarios');
});

app.get('/relatorios', async (req, res) => {
  const result = await client.query('SELECT * FROM funcionarios');
  res.render('relatorios', { funcionarios: result.rows });
});

app.get('/relatorios/pdf', async (req, res) => {
  const result = await client.query('SELECT * FROM funcionarios');
  const funcionarios = result.rows;

  const doc = new PDFDocument();
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', 'attachment; filename=relatorio.pdf');

  doc.pipe(res);
  doc.fontSize(16).text('Relatório de Funcionários', { align: 'center' });
  doc.moveDown();

  funcionarios.forEach((funcionario) => {
    doc.fontSize(12).text(`Nome: ${funcionario.nome}`);
    doc.text(`Horas Extras: ${funcionario.horas_extras}`);
    doc.text(`Horas Folga: ${funcionario.horas_folga}`);
    doc.moveDown();
  });

  doc.end();
});

// Iniciar servidor
app.listen(port, () => {
  console.log(`Servidor rodando em http://localhost:${port}`);
});