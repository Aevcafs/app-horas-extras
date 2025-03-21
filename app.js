const express = require('express');
const bodyParser = require('body-parser');
const { Client } = require('pg');
const bcrypt = require('bcryptjs');
const PDFDocument = require('pdfkit');
const path = require('path');
const session = require('express-session');
const pgSession = require('connect-pg-simple')(session);
require('dotenv').config();

const app = express();
const port = process.env.PORT || 3000;

// Configurações
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Configuração da sessão
app.use(session({
  store: new pgSession({
    conString: process.env.DATABASE_URL, // URL de conexão com o PostgreSQL
    tableName: 'user_sessions', // Nome da tabela para armazenar as sessões
  }),
  secret: 'sua-chave-secreta', // Chave secreta para assinar a sessão
  resave: false,
  saveUninitialized: true,
  cookie: { maxAge: 30 * 24 * 60 * 60 * 1000 }, // 30 dias de duração do cookie
}));

// Conexão com o PostgreSQL
const client = new Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
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

// Middleware para verificar autenticação
const isAuthenticated = (req, res, next) => {
  if (req.session.user) {
    return next();
  }
  res.redirect('/login');
};

// Rotas
app.get('/', (req, res) => {
  res.render('index');
});

app.get('/login', (req, res) => {
  res.render('login', { message: '' });
});

app.post('/login', async (req, res) => {
  const { username, password } = req.body;
  const result = await client.query('SELECT * FROM usuarios WHERE username = $1', [username]);
  const user = result.rows[0];

  if (user && bcrypt.compareSync(password, user.password)) {
    req.session.user = user;
    res.redirect('/');
  } else {
    res.render('login', { message: 'Usuário ou senha incorretos' });
  }
});

app.get('/logout', (req, res) => {
  req.session.destroy();
  res.redirect('/login');
});

app.get('/funcionarios', isAuthenticated, async (req, res) => {
  const result = await client.query('SELECT * FROM funcionarios');
  res.render('funcionarios', { funcionarios: result.rows });
});

app.post('/funcionarios', isAuthenticated, async (req, res) => {
  const { nome } = req.body;
  await client.query('INSERT INTO funcionarios (nome) VALUES ($1)', [nome]);
  res.redirect('/funcionarios');
});

app.get('/relatorios', isAuthenticated, async (req, res) => {
  const result = await client.query('SELECT * FROM funcionarios');
  res.render('relatorios', { funcionarios: result.rows });
});

app.get('/cadastro-funcionario', isAuthenticated, (req, res) => {
  res.render('cadastro-funcionario');
});

app.post('/cadastro-funcionario', isAuthenticated, async (req, res) => {
  const { nome } = req.body;
  await client.query('INSERT INTO funcionarios (nome) VALUES ($1)', [nome]);
  res.redirect('/funcionarios');
});

app.get('/cadastro-horas', isAuthenticated, async (req, res) => {
  const result = await client.query('SELECT * FROM funcionarios');
  res.render('cadastro-horas', { funcionarios: result.rows });
});

app.post('/cadastro-horas', isAuthenticated, async (req, res) => {
  const { funcionarioId, horas, folga } = req.body;
  await client.query(
    'UPDATE funcionarios SET horas_extras = horas_extras + $1, horas_folga = horas_folga + $2 WHERE id = $3',
    [horas, folga, funcionarioId]
  );
  res.redirect('/funcionarios');
});

app.get('/editar-funcionario/:id', isAuthenticated, async (req, res) => {
  const { id } = req.params;
  const result = await client.query('SELECT * FROM funcionarios WHERE id = $1', [id]);
  res.render('editar-funcionario', { funcionario: result.rows[0] });
});

app.post('/editar-funcionario', isAuthenticated, async (req, res) => {
  const { id, nome, horas_extras, horas_folga } = req.body;
  await client.query(
    'UPDATE funcionarios SET nome = $1, horas_extras = $2, horas_folga = $3 WHERE id = $4',
    [nome, horas_extras, horas_folga, id]
  );
  res.redirect('/funcionarios');
});

app.get('/relatorios/pdf', isAuthenticated, async (req, res) => {
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