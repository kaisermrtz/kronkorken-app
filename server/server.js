require('./config/config.js');

const _ = require('lodash');
const fs = require('fs');
const express = require('express');
// const fileUpload = require('express-fileupload');
const path = require('path');
const hbs = require('hbs');
const bodyParser = require('body-parser');
const session = require('express-session');
const MongoStore = require('connect-mongo')(session);
const {ObjectID} = require('mongodb');
const cloudinary = require('cloudinary');

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
// app.use(fileUpload());
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

function isLoggedIn(req){
  if(req.session.userId){
    return true;
  }
  return false;
}

//GET /
app.get('/', (req, res) => {
  res.render('home.hbs',{
    pageTitle: 'Kronkorken App',
    loggedIn: isLoggedIn(req)
  });
});

/*
  Nutzerverwaltung
*/

//GET /register
app.get('/register', (req, res) => {
  res.render('register.hbs', {
    pageTitle: 'Registrieren',
    loggedIn: isLoggedIn(req)
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
        res.redirect('/dashboard?success=error');
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
      crowncaps,
      loggedIn: isLoggedIn(req)
    });
  }catch(e){
    res.status(400).send(e);
  }
});

//GET /sammlung/:id
app.get('/sammlung/:id', async (req, res) => {

  var id = req.params.id;

  //Validate Id using isValid
  if(!ObjectID.isValid(id)){
    return res.redirect('/sammlung');;
  }

  try{
    var crowncap = await CrownCap.findById(id);

    if(!crowncap){
      return res.redirect('/sammlung');
    }

    res.render('einzelansicht.hbs', {
      pageTitle: 'Kronkorken',
      crowncap,
      loggedIn: isLoggedIn(req)
    });
    //res.send({crowncap});
  }catch(e){
    res.redirect('/sammlung');
  }
});

//GET /sammlung/:id/edit
app.get('/sammlung/:id/edit', requiresLogin, async (req, res) => {

  var id = req.params.id;

  //Validate Id using isValid
  if(!ObjectID.isValid(id)){
    return res.redirect('/sammlung');
  }

  try{
    var crowncap = await CrownCap.findById(id);

    if(!crowncap){
      return res.redirect('/sammlung');
    }

    res.render('einzelansichtedit.hbs', {
      pageTitle: 'Kronkorken Bearbeiten',
      crowncap,
      loggedIn: isLoggedIn(req)
    });
    //res.send({crowncap});
  }catch(e){
    res.redirect('/sammlung');
  }
});

//POST /sammlung/:id/edit
app.post('/sammlung/:id/edit', requiresLogin, async (req, res) => {
  var crownCapData = _.pick(req.body, ['name', 'brand', 'country', 'typeOfDrink', 'tags']);
  crownCapData['tried'] = (req.body.tried == 'on');
  crownCapData['special'] = (req.body.special == 'on');

  //Updates in die Datenbank laden
  try{
    var newCrownCap = await CrownCap.findOneAndUpdate({
      _id: req.body.id
    }, {$set: crownCapData}, {new: true});

    if(!newCrownCap){
      res.redirect(`/sammlung/${req.body.id}/edit/?success=false`);
    }

    res.redirect(`/sammlung/${req.body.id}/edit/?success=true`);
  }catch(e){
    res.redirect(`/sammlung/${req.body.id}/edit/?success=false`);
  }
});

//POST /sammlung/:id/edit/delete
app.post('/sammlung/:id/delete', requiresLogin, async (req, res) => {
  var id = req.body.id;
  //Validate Id using isValid
  if(!ObjectID.isValid(id)){
    return res.redirect(`/sammlung/${req.body.id}/edit/?success=false`);
  }

  try{
    var crowncap = await CrownCap.findOneAndRemove({_id: id});
    if(!crowncap){
      return res.redirect(`/sammlung/${req.body.id}/edit/?success=false`);
    }
    res.redirect('/sammlung');
  }catch(e){
    return res.redirect(`/sammlung/${req.body.id}/edit/?success=false`);
  }
});

//DELETE /sammlung/:id
app.delete('/sammlung/:id', requiresLogin, async (req, res) => {
  var id = req.params.id;

  //Validate Id using isValid
  if(!ObjectID.isValid(id)){
    return res.redirect('/sammlung');
  }

  try{
    var crowncap = await CrownCap.findOneAndRemove({_id: id});
    if(!crowncap){
      return res.status(404).send();
    }
    res.send({crowncap});
  }catch(e){
    res.redirect('/sammlung');
  }
});

//GET /dashboard
app.get('/dashboard', requiresLogin, async (req, res) => {
  var recentlyAdded;
  try{
    var crowncaps = await CrownCap.find({}).sort({addedAt: -1});
    recentlyAdded = crowncaps.slice(0,6);
  }catch(e){
    console.log("Error", e);
  }

  res.render('dashboard.hbs', {
    pageTitle: 'Kronkorken Dashboard',
    loggedIn: isLoggedIn(req),
    recentlyAdded
  });

});

//GET /add
app.get('/add', requiresLogin, (req, res) => {
  res.render('add.hbs', {
    pageTitle: 'Kronkorken Hinzufügen',
    loggedIn: isLoggedIn(req)
  });
});

// function cloudinaryAsync(file, options){
//   return new Promise((resolve,reject) => {
//     cloudinary.v2.uploader.upload(file, options, (error, result) => {
//       if(result){
//         resolve(result);
//       }
//       reject(error);
//     });
//   });
// }

//POST /add
app.post('/add', requiresLogin, async (req, res) => {
  //Objekt zum speichern erzeugen
  var crownCapData = _.pick(req.body, ['name', 'brand', 'country', 'typeOfDrink', 'tags', 'image']);
  crownCapData['addedAt'] = new Date().getTime();
  crownCapData['_addedBy'] = req.session.userId;
  crownCapData['tried'] = (req.body.tried == 'on');
  crownCapData['special'] = (req.body.special == 'on');
  console.log(JSON.stringify(crownCapData));

  var crownCap = new CrownCap(crownCapData);
  try{
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
