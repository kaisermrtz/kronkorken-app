require('./config/config.js');

const _ = require('lodash');
const express = require('express');
const path = require('path');
const hbs = require('hbs');
const bodyParser = require('body-parser');

var {mongoose} = require('./db/mongoose');
var {User} = require('./models/user');

//Setup express, hbs, bodyParser
var app = express();
const port = process.env.PORT || 3000;
const publicPath = path.join(__dirname, '../public');
hbs.registerPartials(__dirname + '/../views/partials');
app.set('view engine', 'hbs');
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({extended: true}));
app.use(express.static(publicPath));

//Helferfunktion
hbs.registerHelper('getCurrentYear', () => {
  return new Date().getFullYear();
});

//GET /
app.get('/', (req, res) => {
  res.render('home.hbs',{
    pageTitle: 'Kronkorken App',
    welcomeMessage: 'Willkommen zur NodeJS Kronkorkenseite'
  });
});

//GET /sammlung
app.get('/sammlung', (req, res) => {
  res.render('sammlung.hbs', {
    pageTitle: 'Kronkorken Sammlung'
  });
});

//GET /register
app.get('/register', (req, res) => {
  res.render('register.hbs', {
    pageTitle: 'Kronkorken Registrieren'
  });
});

//POST /register
app.post('/register', (req, res) => {
  var userData = _.pick(req.body, ['email', 'username', 'password']);
  var user = new User(userData);

  user.save().then(() => {
    res.redirect('/');
  }).catch((e) => {
    res.status(400).send(e);
  })

});

app.listen(port, () => {
  console.log(`Gestartet auf Port ${port}`);
});
