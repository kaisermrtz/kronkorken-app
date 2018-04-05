require('./config/config.js');

const _ = require('lodash');
const express = require('express');
const path = require('path');
const hbs = require('hbs');
const bodyParser = require('body-parser');
const session = require('express-session');
const MongoStore = require('connect-mongo')(session);

var {mongoose} = require('./db/mongoose');
var {User} = require('./models/user');
var {CrownCap} = require('./models/crowncap');
var {requiresLogin} = require('./middleware/requiresLogin');

//Setup express, hbs, bodyParser
var app = express();
const port = process.env.PORT;
const publicPath = path.join(__dirname, '../public');
hbs.registerPartials(__dirname + '/../views/partials');
app.set('view engine', 'hbs');

//Middleware
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({extended: true}));
app.use(express.static(publicPath));
app.use(session({
  secret: process.env.SESSION_SECRET,
  resave: true,
  saveUninitialized: false,
  store: new MongoStore({mongooseConnection: mongoose.connection})
}));

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
app.get('/sammlung',requiresLogin, async (req, res) => {
  try{
    var crowncaps = await CrownCap.find({});
    res.render('sammlung.hbs', {
      pageTitle: 'Kronkorken Sammlung',
      crowncaps
    });
  }catch(e){
    res.status(400).send(e);
  }
});

//GET /register
app.get('/register', (req, res) => {
  res.render('register.hbs', {
    pageTitle: 'Kronkorken Registrieren'
  });
});

//POST /register
app.post('/register', async (req, res) => {
  var userData = _.pick(req.body, ['email', 'username', 'password']);
  var user = new User(userData);

  try{
    await user.save();
    res.redirect('/');
  }catch(e){
    res.status(400).send(e);
  }
});

//GET /login
app.get('/login', (req, res) => {
  res.render('login.hbs', {
    pageTitle: 'Kronkorken Login'
  });
});

//POST /login
app.post('/login', async (req, res) => {
  try{
    var user = await User.authenticate(req.body.email, req.body.password);
    req.session.userId = user._id;
    res.redirect('/');
  }catch(e){
    res.status(404).send(e);
  }
});

//GET /logout
app.get('/logout', (req, res) => {
  if(req.session){
    //Session Object entfernen
    req.session.destroy((e) => {
      if(e){
        res.status(400).send(e);
      }else{
        res.redirect('/');
      }
    })
  }
});

//GET /add
app.get('/add', requiresLogin, (req, res) => {
  res.render('add.hbs', {
    pageTitle: 'Kronkorken Hinzufügen'
  });
});

//POST /add
app.post('/add', requiresLogin, async (req, res) => {
  var crownCapData = _.pick(req.body, ['name', 'brand', 'country', 'typeOfDrink', 'tags','image']);
  crownCapData['addedAt'] = new Date().getTime();
  crownCapData['_addedBy'] = req.session.userId;
  crownCapData['tried'] = (req.body.tried == 'on');
  crownCapData['special'] = (req.body.special == 'on');
  console.log(JSON.stringify(crownCapData));
  var crownCap = new CrownCap(crownCapData);

  try{
    await crownCap.save();
    res.redirect('/');
  }catch(e){
    res.status(400).send(e);
  }
});

app.listen(port, () => {
  console.log(`Gestartet auf Port ${port}`);
});
