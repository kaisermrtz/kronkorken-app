require('./config/config.js');

const _ = require('lodash');
const fs = require('fs');
const express = require('express');
const fileUpload = require('express-fileupload');
const path = require('path');
const hbs = require('hbs');
const bodyParser = require('body-parser');
const session = require('express-session');
const MongoStore = require('connect-mongo')(session);
const {ObjectID} = require('mongodb');
const sharp = require('sharp');

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
app.use(fileUpload());
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
  if(req.session.userId){
    res.redirect('/dashboard');
  }
  res.render('home.hbs',{
    pageTitle: 'Kronkorken App'
  });
});

/*
  Nutzerverwaltung
*/

//GET /register
app.get('/register', (req, res) => {
  res.render('register.hbs', {
    pageTitle: 'Registrieren'
  });
});

//POST /register
app.post('/register', async (req, res) => {
  var userData = _.pick(req.body, ['email', 'username', 'password']);
  var user = new User(userData);

  try{
    await user.save();
    res.redirect('/register?success=true');
  }catch(e){
    res.redirect('/register?success=' + e.message);
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
    res.redirect('/dashboard');
  }catch(e){
    //res.status(404).send(e);
    res.redirect('/');
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

/*
  Kronkorken
*/

//GET /sammlung
app.get('/sammlung', async (req, res) => {
  if(req.session.userId){
    res.redirect('/dashboard');
  }
  try{
    if(Object.keys(req.query).length === 0 || req.query.q === ''){
      var crowncaps = await CrownCap.find({});
    }else{
      var crowncaps = await CrownCap.find().or(
        [
          {brand: new RegExp(req.query.q, 'i')},
          {name: new RegExp(req.query.q, 'i')},
          {country: req.query.q},
          {typeOfDrink: req.query.q},
          {tags: new RegExp(req.query.q, 'i')}
        ]);
    }

    res.render('sammlung.hbs', {
      pageTitle: 'Kronkorken Sammlung',
      crowncaps
    });
  }catch(e){
    res.status(400).send(e);
  }
});

//GET /sammlung/:id
app.get('/sammlung/:id', async (req, res) => {
  if(req.session.userId){
    res.redirect('/dashboard');
  }
  var id = req.params.id;

  //Validate Id using isValid
  if(!ObjectID.isValid(id)){
    return res.status(404).send();
  }

  try{
    var crowncap = await CrownCap.findById(id);

    if(!crowncap){
      return res.status(404).send();
    }

    res.render('einzelansicht.hbs', {
      pageTitle: 'Kronkorken',
      crowncap
    });
    //res.send({crowncap});
  }catch(e){
    res.status(400).send();
  }
});

//DELETE /sammlung/:id
app.delete('/sammlung/:id', requiresLogin, async (req, res) => {
  var id = req.params.id;

  //Validate Id using isValid
  if(!ObjectID.isValid(id)){
    return res.status(404).send();
  }

  try{
    var crowncap = await CrownCap.findOneAndRemove({_id: id});
    if(!crowncap){
      return res.status(404).send();
    }
    res.send({crowncap});
  }catch(e){
    res.status(400).send();
  }
});

//PATCH /sammlung/:id -- noch nicht fertig
app.patch('/sammlung/:id', async (req, res) => {
  var id = req.params.id;

  //hier noch nicht fertig
  var body = _.pick(req.body, ['text', 'completed']);

  if(!ObjectID.isValid(id)){
    return res.status(404).send();
  }

  //weitere Lokale Updates falls nötig

  //Updates in die Datenbank laden
  try{
    var crowncap = await CrownCap.findOneAndUpdate({
      _id: id
    }, {$set: body}, {new: true});

    if(!crowncap){
      return res.status(404).send();
    }

    res.send({crowncap});
  }catch(e){
    res.status(400).send();
  }
});

//GET /dashboard
app.get('/dashboard', requiresLogin, (req, res) => {
  res.render('dashboard.hbs', {
    pageTitle: 'Kronkorken Dashboard'
  });
});

//GET /add
app.get('/add', requiresLogin, (req, res) => {
  res.render('add.hbs', {
    pageTitle: 'Kronkorken Hinzufügen'
  });
});

//POST /add
app.post('/add', requiresLogin, async (req, res) => {
  //Objekt zum speichern erzeugen
  var crownCapData = _.pick(req.body, ['name', 'brand', 'country', 'typeOfDrink', 'tags']);
  crownCapData['addedAt'] = new Date().getTime();
  crownCapData['_addedBy'] = req.session.userId;
  crownCapData['tried'] = (req.body.tried == 'on');
  crownCapData['special'] = (req.body.special == 'on');
  var fileName = new Date().getTime() + req.session.userId;
  crownCapData['image'] = fileName;
  console.log(JSON.stringify(crownCapData));

  var crownCap = new CrownCap(crownCapData);
  try{
    //Upload Image
    if(!req.files){
      return new Error();
    }
    let file = req.files.image;
    await file.mv(`public/img/kronkorken/${fileName}.jpg`);
    //Bild verkleinern
    await sharp(`public/img/kronkorken/${fileName}.jpg`)
     .resize(300,300)
     .toFile(`public/img/kronkorken/${fileName}_resized.jpg`);
    //große Version löschen
    fs.unlink(`public/img/kronkorken/${fileName}.jpg`, (err) => {
      return new Error();
    });

    //Speichern in der Datenbank
    await crownCap.save();
    res.redirect('/add?success=true');
  }catch(e){
    console.log(e);
    res.redirect('/add?success=false');
  }
});

app.listen(port, () => {
  console.log(`Gestartet auf Port ${port}`);
});
