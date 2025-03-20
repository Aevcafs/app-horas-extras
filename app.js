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

// Rota para exibir o formulário de cadastro
app.get('/cadastro-funcionario', isAuthenticated, (req, res) => {
  res.render('cadastro-funcionario');
});

// Rota para processar o formulário de cadastro
app.post('/cadastro-funcionario', isAuthenticated, async (req, res) => {
  const { nome } = req.body;
  await client.query('INSERT INTO funcionarios (nome) VALUES ($1)', [nome]);
  res.redirect('/funcionarios');
});

// Rota para exibir o formulário de cadastro de horas
app.get('/cadastro-horas', isAuthenticated, async (req, res) => {
  const result = await client.query('SELECT * FROM funcionarios');
  res.render('cadastro-horas', { funcionarios: result.rows });
});

// Rota para processar o formulário de cadastro de horas
app.post('/cadastro-horas', isAuthenticated, async (req, res) => {
  const { funcionarioId, horas, folga } = req.body;
  await client.query(
    'UPDATE funcionarios SET horas_extras = horas_extras + $1, horas_folga = horas_folga + $2 WHERE id = $3',
    [horas, folga, funcionarioId]
  );
  res.redirect('/funcionarios');
});

// Rota para exibir o formulário de edição
app.get('/editar-funcionario/:id', isAuthenticated, async (req, res) => {
  const { id } = req.params;
  const result = await client.query('SELECT * FROM funcionarios WHERE id = $1', [id]);
  res.render('editar-funcionario', { funcionario: result.rows[0] });
});

// Rota para processar o formulário de edição
app.post('/editar-funcionario', isAuthenticated, async (req, res) => {
  const { id, nome, horas_extras, horas_folga } = req.body;
  await client.query(
    'UPDATE funcionarios SET nome = $1, horas_extras = $2, horas_folga = $3 WHERE id = $4',
    [nome, horas_extras, horas_folga, id]
  );
  res.redirect('/funcionarios');
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