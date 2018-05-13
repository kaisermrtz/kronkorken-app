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
var {countryCodeArray, addCountryCode} = require('./util/countryCodeArray');

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
app.get('/', async (req, res) => {
  var countryCountArrayFirst5;
  var recentlyAdded;
  try{
    var crowncaps = await CrownCap.find({}).sort({addedAt: -1});
    recentlyAdded = crowncaps.slice(0,6);

    var count = await CrownCap.count({});
    var countryCountArray = await CrownCap.aggregate([{ $group: { _id: '$country', count: { $sum: 1}}}]).sort({count: -1});
    var brandCountArray = await CrownCap.aggregate([{ $group: { _id: '$brand', count: { $sum: 1}}}]).sort({count: -1});
    var countries = countryCountArray.length;
  }catch(e){
    console.log("Error", e);
  }

  addCountryCode(recentlyAdded);


  res.render('home.hbs',{
    pageTitle: 'Kronkorken App',
    loggedIn: isLoggedIn(req),
    recentlyAdded,
    countryCount: JSON.stringify(countryCountArray),
    count,
    countries,
    brandCount: JSON.stringify(brandCountArray.slice(0,5)).replace(new RegExp("'", 'g'), '&apos;') 
  });
});

/*
  Nutzerverwaltung
*/

//GET /register
app.get('/register', requiresLogin, (req, res) => {
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
  var itemsPerPage = 60;

  var searchArray = [
    {brand: new RegExp(req.query.q, 'i')},
    {name: new RegExp(req.query.q, 'i')},
    {country: new RegExp(req.query.q, 'i')},
    {typeOfDrink: req.query.q},
    {tags: new RegExp(req.query.q, 'i')}
  ];

  //Filter behandeln
  var optionsArray = [{}];
  if(req.query.country && req.query.country !== ''){
    optionsArray.push({country: new RegExp(req.query.country, 'i')});
  }
  if(req.query.typeOfDrink && req.query.typeOfDrink !== ''){
    optionsArray.push({typeOfDrink: new RegExp(req.query.typeOfDrink, 'i')});
  }
  if(req.query.special && req.query.special !== ''){
    optionsArray.push({special: req.query.special});
  }
  if(req.query.itemsPerPage && req.query.itemsPerPage !== ''){
    itemsPerPage = parseInt(req.query.itemsPerPage);
  }

  try{
    //Wenn kein Query angegeben, bzw. leerer Query
    if(req.query.q === '' || req.query.q == undefined){
      //Wenn keine Seite angegeben
      if(req.query.page < 1){
        var crowncaps = await CrownCap.find().and(optionsArray).sort({brand: 'asc', name: 'asc'}).skip(0).limit(itemsPerPage);
      }else{
        var crowncaps = await CrownCap.find().and(optionsArray).sort({brand: 'asc', name: 'asc'}).skip((req.query.page-1)*itemsPerPage).limit(itemsPerPage);
      }
      var count = await CrownCap.find().and(optionsArray).count();
    }else{
      //Wenn keine Seite angegeben
      if(req.query.page < 1){
        var crowncaps = await CrownCap.find().or(searchArray).and(optionsArray)
        .sort({brand: 'asc', name: 'asc'}).skip(0).limit(itemsPerPage);
      }else{
        var crowncaps = await CrownCap.find().or(searchArray)
        .and(optionsArray).sort({brand: 'asc', name: 'asc'})
        .skip((req.query.page-1)*itemsPerPage).limit(itemsPerPage);
      }

      var count = await CrownCap.find()
      .or(searchArray).and(optionsArray)
      .sort({brand: 'asc', name: 'asc'})
      .count();
    }

    addCountryCode(crowncaps);

    //Alle aktuellen Länder bekommen
    var countryArray = await CrownCap.find().distinct('country');
    countryArray.sort();

    //Seitenzahl ausrechnen
    var pages = count / itemsPerPage;
    var numberOfPages = Math.ceil(pages);

    //rendern
    res.render('sammlung.hbs', {
      pageTitle: 'Kronkorken Sammlung',
      crowncaps,
      loggedIn: isLoggedIn(req),
      numberOfPages,
      countries: JSON.stringify(countryArray)
    });
  }catch(e){
    res.status(400).send(e);
  }
});

//GET /doppelte
app.get('/doppelte', requiresLogin, async (req, res) => {
  try{
    numberOfPages = 1;
    var crowncaps = await CrownCap.find({quantity: {$gt: 1}}).sort({brand: 'asc'});
    addCountryCode(crowncaps);

    //rendern
    res.render('doppelte.hbs', {
      pageTitle: 'Kronkorken Doppelte',
      crowncaps,
      loggedIn: isLoggedIn(req),
      numberOfPages
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
  try{
    if(req.body.oldCloudinaryImageId === req.body.cloudinaryImageId){
      var crownCapData = _.pick(req.body, ['name', 'brand', 'country', 'typeOfDrink', 'tags', 'location', 'quantity']);
    }else{
      var crownCapData = _.pick(req.body, ['name', 'brand', 'country', 'typeOfDrink', 'tags', 'location', 'quantity', 'image', 'cloudinaryImageId']);
      //Altes Bild löschen
      var returnValue = await cloudinaryAsyncDelete(req.body.oldCloudinaryImageId);
    }
    crownCapData['tried'] = (req.body.tried == 'on');
    crownCapData['special'] = (req.body.special == 'on');

    //Updates in die Datenbank laden
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

//POST /sammlung/:id/delete
app.post('/sammlung/:id/delete', requiresLogin, async (req, res) => {
  var id = req.body.id;
  //Validate Id using isValid
  if(!ObjectID.isValid(id)){
    return res.redirect(`/sammlung/${req.body.id}/edit/?success=false`);
  }

  try{
    //hier Bild auf cloudinary löschen
    var crowncapA = await CrownCap.findById(id);
    var returnValue = await cloudinaryAsyncDelete(crowncapA.cloudinaryImageId);

    var crowncap = await CrownCap.findOneAndRemove({_id: id});
    if(!crowncap){
      return res.redirect(`/sammlung/${req.body.id}/edit/?success=false`);
    }
    res.redirect('/sammlung');
  }catch(e){
    return res.redirect(`/sammlung/${req.body.id}/edit/?success=false`);
  }
});

//GET /dashboard
app.get('/dashboard', requiresLogin, async (req, res) => {
  var recentlyAdded;
  try{
    var crowncaps = await CrownCap.find({}).sort({addedAt: -1});
    recentlyAdded = crowncaps.slice(0,6);

    var count = await CrownCap.count({});
    var countryCountArray = await CrownCap.aggregate([{ $group: { _id: '$country', count: { $sum: 1}}}]).sort({count: -1});
  }catch(e){
    console.log("Error", e);
  }
  addCountryCode(recentlyAdded);

  res.render('dashboard.hbs', {
    pageTitle: 'Kronkorken Dashboard',
    loggedIn: isLoggedIn(req),
    recentlyAdded,
    count,
    countryCountArray,
    countryCountJSON: JSON.stringify(countryCountArray)
  });
});

//GET /add
app.get('/add', requiresLogin, (req, res) => {
  res.render('add.hbs', {
    pageTitle: 'Kronkorken Hinzufügen',
    loggedIn: isLoggedIn(req)
  });
});

function cloudinaryAsyncDelete(imageid){
  return new Promise((resolve, reject) => {
    cloudinary.uploader.destroy(imageid, (result, error) => {
      if(result){
        resolve(result);
      }
      reject(error);
    });
  });
}

//POST /add
app.post('/add', requiresLogin, async (req, res) => {
  //Objekt zum speichern erzeugen
  var crownCapData = _.pick(req.body, ['name', 'brand', 'country', 'typeOfDrink', 'tags','location', 'quantity', 'image', 'cloudinaryImageId']);
  crownCapData['addedAt'] = new Date().getTime();
  crownCapData['_addedBy'] = req.session.userId;
  crownCapData['tried'] = (req.body.tried == 'on');
  crownCapData['special'] = (req.body.special == 'on');

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
