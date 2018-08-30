require('./config/config.js');

const _ = require('lodash');
const fs = require('fs');
const express = require('express');
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
var {TradePartner} = require('./models/tradePartner');
var {TradeTransaction} = require('./models/tradeTransaction');
var {requiresLogin} = require('./middleware/requiresLogin');
var {countryCodeArray, addCountryCode} = require('./util/countryCodeArray');
var {trainModel, getSimilarDocuments, importModel} = require('./util/contentBasedRecommender');

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
    var typeCountArray = await CrownCap.aggregate([{ $group: { _id: '$typeOfDrink', count: { $sum: 1}}}]).sort({count: -1});
    var historyGroup = {
      $group: {
          _id: {
              "year": {
                  "$year": {
                      "$add": [
                          new Date(0),
                          "$addedAt"
                      ]
                  }
              },
              "month": {
                  "$month": {
                      "$add": [
                          new Date(0),
                          "$addedAt"
                      ]
                  }
              }
          },
          count : { $sum : 1 }
      }
    };
    var randomCrownCaps = await CrownCap.aggregate([{'$sample': {'size': 6}}]);
    var historyCountArray = await CrownCap.aggregate([historyGroup]).sort({"_id.year": 1, "_id.month": 1});
    var countries = countryCountArray.length;
  }catch(e){
    console.log("Error", e);
  }

  addCountryCode(recentlyAdded);
  addCountryCode(countryCountArray);
  addCountryCode(randomCrownCaps);
  res.render('home.hbs',{
    pageTitle: 'Kronkorken App',
    loggedIn: isLoggedIn(req),
    recentlyAdded,
    countryCount: JSON.stringify(countryCountArray),
    historyCountArray: JSON.stringify(historyCountArray.slice(-6)),
    randomCrownCaps,
    count,
    countries,
    brandCount: JSON.stringify(brandCountArray.slice(0,5)).replace(new RegExp("'", 'g'), ''),
    typeCount: JSON.stringify(typeCountArray)
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

//GET /login
app.get('/login', async (req, res) => {
  res.render('login.hbs', {
    pageTitle: 'Kronkorken Login',
    loggedIn: isLoggedIn(req)
  })
})

//POST /logginIn
app.post('/logginIn', async (req, res) => {
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

app.get('/datenschutz', (req, res) => {
  res.render('datenschutz.hbs');
});

app.get('/impressum', (req, res) => {
  res.render('impressum.hbs');
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
    {tags: new RegExp(req.query.q, 'i')},
    {location: new RegExp(req.query.q, 'i')},
    {nonLatinInscription: new RegExp(req.query.q, 'i')}
  ];

  //spezielle Filtermöglichkeiten für Pro User
  if(req.query.q && req.query.q.includes('brandname=')){
    var brandname = req.query.q.substring(10);
    searchArray = [{brand: brandname}];
  }
  if(req.query.q && req.query.q.includes('location=')){
    var location = req.query.q.substring(9);
    searchArray = [{location}];
  }
  if(req.query.location){
    searchArray = [{location: req.query.location}];
  }

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
        var crowncaps = await CrownCap.find().or(searchArray).and(optionsArray).sort({brand: 'asc', name: 'asc'}).skip(0).limit(itemsPerPage);
      }else{
        var crowncaps = await CrownCap.find().or(searchArray).and(optionsArray).sort({brand: 'asc', name: 'asc'}).skip((req.query.page-1)*itemsPerPage).limit(itemsPerPage);
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

//GET /advanced-search
app.get('/advanced-search', async (req, res) => {
  try{
    var crowncaps = await CrownCap.find({"nonLatinInscription": {"$exists" : true, "$ne" : ""}}).sort({"nonLatinInscription": 'asc'});
    var nonLatinInscriptions = [];
    crowncaps.forEach((element) => {
      nonLatinInscriptions.push(_.pick(element, ["nonLatinInscription"]));
    });

    nonLatinInscriptions = _.uniqBy(nonLatinInscriptions, 'nonLatinInscription');

    res.render('advancedSearch.hbs', {
      pageTitle: 'Kronkorken Suche',
      nonLatinInscriptions,
      loggedIn: isLoggedIn(req),
    });
  }catch(e){
    console.log(e);
    res.redirect('/advanced-search?success=false');
  }
});

//GET /new-trade
app.get('/new-trade', async (req, res) => {
  try{
    var crowncapsDE = await CrownCap.find({quantity: {$gt: 0}, country: 'Deutschland', special: false}).sort({brand: 'asc', name: 'asc'});
    var crowncapsNotDE = await CrownCap.find({quantity: {$gt: 0}, country: {$not: /Deutschland/}, special: false}).sort({brand: 'asc', name: 'asc'});
    var crowncapsSpecial = await CrownCap.find({quantity: {$gt: 0}, special: true}).sort({brand: 'asc', name: 'asc'});
    addCountryCode(crowncapsDE);
    addCountryCode(crowncapsNotDE);
    addCountryCode(crowncapsSpecial);

    //rendern
    res.render('newTrade.hbs', {
      pageTitle: 'Kronkorken Doppelte',
      crowncapsDE,
      crowncapsNotDE,
      crowncapsSpecial,
      crowncapsDECount: crowncapsDE.length,
      crowncapsNotDECount: crowncapsNotDE.length,
      crowncapsSpecialCount: crowncapsSpecial.length,
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

    //Ähnliche Kronkorken raussuchen (TF-IDF basiert)
    var similarDocuments = getSimilarDocuments(id, 6);
    var similarCrownCaps = [];
    if(similarDocuments.length == 0){
      //Wenn es keine 6 ähnlichen gibt -> Zufällige nehmen
      var randomCrownCaps = await CrownCap.aggregate([{'$sample': {'size': 6}}]);
      similarCrownCaps = randomCrownCaps;
    }else{
      for(var i=0; i<similarDocuments.length; i++){
        var cc = await CrownCap.findById(similarDocuments[i].id);
        similarCrownCaps.push(cc);
      }

      //Wenn weniger als 6 -> den Rest auffüllen
      if(similarCrownCaps.length < 6){
        var randomCrownCaps = await CrownCap.aggregate([{'$sample': {'size': 6 - similarCrownCaps.length}}]);
        randomCrownCaps.forEach((cc) => {
          similarCrownCaps.push(cc);
        });
      }
    }

    var crowncap = await CrownCap.findById(id);
    if (crowncap._tradeTransaction) {
      var transaction = await TradeTransaction.findById(crowncap._tradeTransaction);
      var partner = await TradePartner.findById(transaction._tradePartner);
    }else{
      var partner = {};
    }

    if(!crowncap){
      return res.redirect('/sammlung');
    }

    addCountryCode([crowncap]);
    addCountryCode(similarCrownCaps);

    res.render('einzelansicht.hbs', {
      pageTitle: 'Kronkorken',
      crowncap,
      partner,
      loggedIn: isLoggedIn(req),
      similarCrownCaps
    });
    //res.send({crowncap});
  }catch(e){
    console.log(e);
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

  try {
    var transactions = await TradeTransaction.aggregate([{
      $lookup: {
        from: "tradepartners", // collection name in db
        localField: "_tradePartner",
        foreignField: "_id",
        as: "tradePartner"
      }
    }]).sort({date: -1});
    for(var i=0;i<transactions.length;i++){
      transactions[i].tradePartner = transactions[i].tradePartner[0].name;
    }
  }catch(e){
    console.log(e);
    var transactions = [];
  }

  try{
    var crowncap = await CrownCap.findById(id);

    if(!crowncap){
      return res.redirect('/sammlung');
    }

    res.render('einzelansichtedit.hbs', {
      pageTitle: 'Kronkorken Bearbeiten',
      crowncap,
      transactions,
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
      var crownCapData = _.pick(req.body, ['name', 'brand', 'country', 'typeOfDrink', 'tags', 'location', 'quantity', '_tradeTransaction', 'nonLatinInscription']);
    }else{
      var crownCapData = _.pick(req.body, ['name', 'brand', 'country', 'typeOfDrink', 'tags', 'location', 'quantity', 'image', 'cloudinaryImageId', '_tradeTransaction', 'nonLatinInscription']);
      //Altes Bild löschen
      var returnValue = await cloudinaryAsyncDelete(req.body.oldCloudinaryImageId);
    }
    crownCapData['tried'] = (req.body.tried == 'on');
    crownCapData['special'] = (req.body.special == 'on');

    //Entfernen der tradeTransaction wenn diese auf "" gesetzt wurde
    if(crownCapData._tradeTransaction == ""){
      var newCrownCap = await CrownCap.findOneAndUpdate({
        '_id': req.body.id
      }, {$unset: {'_tradeTransaction': ''}}, {new: true});
      crownCapData = _.omit(crownCapData, '_tradeTransaction');
    }

    //Updates in die Datenbank laden
    var newCrownCap = await CrownCap.findOneAndUpdate({
      _id: req.body.id
    }, {$set: crownCapData}, {new: true});



    if(!newCrownCap){
      res.redirect(`/sammlung/${req.body.id}/edit/?success=false`);
    }
    res.redirect(`/sammlung?q=brandname%3D${newCrownCap.brand}`);
  }catch(e){
    console.log(e);
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
  var brandCountArrayTop20;
  try{
    var crowncaps = await CrownCap.find({}).sort({addedAt: -1});
    recentlyAdded = crowncaps.slice(0,18);

    var count = await CrownCap.count({});
    var countryCountArray = await CrownCap.aggregate([{ $group: { _id: '$country', count: { $sum: 1}}}]).sort({count: -1});
    var brandCountArray = await CrownCap.aggregate([{ $group: { _id: '$brand', count: { $sum: 1}}}]).sort({count: -1});
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
    countryCountJSON: JSON.stringify(countryCountArray),
    brandCountArray: JSON.stringify(brandCountArray.slice(0,30)).replace(new RegExp("'", 'g'), '')
  });
});

//GET /add
app.get('/add', requiresLogin, async (req, res) => {
  try {
    var transactions = await TradeTransaction.aggregate([{
      $lookup: {
        from: "tradepartners", // collection name in db
        localField: "_tradePartner",
        foreignField: "_id",
        as: "tradePartner"
      }
    }]).sort({date: -1});
    for(var i=0;i<transactions.length;i++){
      transactions[i].tradePartner = transactions[i].tradePartner[0].name;
    }
  }catch(e){
    console.log(e);
    var transactions = [];
  }

  res.render('add.hbs', {
    pageTitle: 'Kronkorken Hinzufügen',
    transactions,
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
  var crownCapData = _.pick(req.body, ['name', 'brand', 'country', 'typeOfDrink', 'tags','location', 'quantity', 'image', 'cloudinaryImageId', 'nonLatinInscription']);
  if(req.body._tradeTransaction != ""){
    crownCapData['_tradeTransaction'] = req.body._tradeTransaction;
  }
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

/*
  Trade
**/

//GET /history
app.get('/history', async (req, res) => {
  try {
    var partners = await TradePartner.find();
    var transactions = await TradeTransaction.aggregate([{
      $lookup: {
        from: "tradepartners", // collection name in db
        localField: "_tradePartner",
        foreignField: "_id",
        as: "tradePartner"
      }
    }]).sort({date: -1});
    for(var i=0;i<transactions.length;i++){
      transactions[i].tradePartner = transactions[i].tradePartner[0].name;

      var crowncaps = await CrownCap.find({_tradeTransaction: transactions[i]._id});

      var idarray = [];
      for(var j=0;j<crowncaps.length; j++){
        idarray.push(crowncaps[j]._id + "");
      }
      transactions[i].receivedCapsJSON = JSON.stringify(idarray);
    }


    addCountryCode(partners);
  }catch(e){
    console.log(e);
    var partners = [];
    var transactions = [];
  }

  res.render('tradeHistory.hbs', {
    pageTitle: 'Kronkorken Tauschpartner',
    partners,
    transactions,
    loggedIn: isLoggedIn(req)
  });
});

//GET /history/addPartner
app.get('/history/addPartner', requiresLogin, async (req, res) => {
  res.render('addTradePartner.hbs', {
    pageTitle: 'Kronkorken Tauschpartner',
    loggedIn: isLoggedIn(req)
  });
});

//POST /history/addPartner
app.post('/history/addPartner', requiresLogin, async(req, res) => {
  var partnerData = _.pick(req.body, ['name', 'country', 'email', 'website']);

  try{
    var partner = new TradePartner(partnerData);
    //Speichern in der Datenbank
    await partner.save();
    res.redirect('/history');
  }catch(e){
    console.log(e);
    res.redirect('/history/addPartner?success=false');
  }
});

//GET /history/addTransaction
app.get('/history/addTransaction', requiresLogin, async (req, res) => {

  try {
    var partners = await TradePartner.find();
  }catch(e){
    console.log(e);
    var partners = [];
  }

  res.render('addTradeTransaction.hbs', {
    pageTitle: 'Kronkorken Tauschtransaktion',
    partners,
    loggedIn: isLoggedIn(req)
  });
});

//POST /history/addTransaction
app.post('/history/addTransaction', requiresLogin, async (req, res) => {
  try{
    var transactionData = _.pick(req.body, ['_tradePartner', 'sendCapsJSON']);
    transactionData['tried'] = (req.body.blind == 'on');
    transactionData['date'] = Date.parse(req.body.date);
    transactionData['_addedBy'] = req.session.userId;
    if(transactionData['sendCapsJSON'] != ''){
      var ccarray = JSON.parse(transactionData.sendCapsJSON);
      var count = ccarray.length;
      transactionData['count'] = count;
    }

    var transaction = new TradeTransaction(transactionData);
    //Speichern in der Datenbank
    await transaction.save();

    res.redirect('/history');
  }catch(e){
    console.log(e);
    res.redirect('/history/addTransaction?success=false');
  }
});

//POST /history/delete/transaction
app.post('/history/delete/transaction', requiresLogin, async (req, res) => {
  var id = req.body.id;
  //Validate Id using isValid
  if(!ObjectID.isValid(id)){
    return res.redirect(`/history?success=false`);
  }

  try{
    var crowncaps = await CrownCap.find({_tradeTransaction: id});
    for(var i=0; i<crowncaps.length;i++){
      var newCrownCap = await CrownCap.findOneAndUpdate({
        '_id': crowncaps[i]._id
      }, {$unset: {'_tradeTransaction': ''}}, {new: true});
    }

    var transaction = await TradeTransaction.findOneAndRemove({_id: id});

    if(!transaction){
      return res.redirect(`/history?success=false`);
    }
    res.redirect('/history?success=true');
  }catch(e){
    console.log(e);
    return res.redirect(`/history?success=false`);
  }
});

//POST /history/delete/partner
app.post('/history/delete/partner', requiresLogin, async (req, res) => {
  var id = req.body.id;
  //Validate Id using isValid
  if(!ObjectID.isValid(id)){
    return res.redirect(`/history?success=false`);
  }

  try{
    var partner = await TradePartner.findOneAndRemove({_id: id});
    if(!partner){
      return res.redirect(`/history?success=false`);
    }
    var transactions = await TradeTransaction.find({_tradePartner: id})

    for(var j=0; j<transactions.length;j++){
      var crowncaps = await CrownCap.find({_tradeTransaction: transactions[j]._id});
      for(var i=0; i<crowncaps.length;i++){
        var newCrownCap = await CrownCap.findOneAndUpdate({
          '_id': crowncaps[i]._id
        }, {$unset: {'_tradeTransaction': ''}}, {new: true});
      }
    }

    transactions = await TradeTransaction.find({_tradePartner: id}).remove();
    res.redirect('/history?success=true');
  }catch(e){
    return res.redirect(`/history?success=false`);
  }
});

//GET /traderequest
app.get('/traderequest', async (req, res) => {
  try{
    var query = JSON.parse(req.query.tradecc);

    var objectIDArray = [];
    query.forEach((element) => {
      objectIDArray.push(mongoose.Types.ObjectId(element));
    });
    var crowncaps = await CrownCap.find({'_id': { $in: objectIDArray }}).sort({"country": 1, "brand": 1, "name": 1});
    addCountryCode(crowncaps);

    var countryCountArray = await CrownCap.aggregate([
      { $match: { '_id': { $in: objectIDArray}}},
      { $group: { _id: '$country'}}
    ]);

    //rendern
    res.render('tradedCaps.hbs', {
      pageTitle: 'Traded Caps',
      crowncaps,
      crowncapsLength: crowncaps.length,
      countries: countryCountArray.length,
      crowncapIds: JSON.stringify(query),
      loggedIn: isLoggedIn(req)
    });
  }catch(e){
    res.redirect(req.header('Referer'));
  }
});

//GET /trade
app.get('/trade', requiresLogin, async (req, res) => {
  try{
    var query = JSON.parse(req.query.tradecc);
    var objectIDArray = [];
    query.forEach((element) => {
      objectIDArray.push(mongoose.Types.ObjectId(element));
    });
    var crowncaps = await CrownCap.find({'_id': { $in: objectIDArray }}).sort({"country": 1, "brand": 1, "name": 1});
    addCountryCode(crowncaps);

    //rendern
    res.render('tausch.hbs', {
      pageTitle: 'Tauschanfrage',
      crowncaps,
      crowncapIds: JSON.stringify(query),
      loggedIn: isLoggedIn(req)
    });
  }catch(e){
    res.redirect(req.header('Referer'));
  }
});

//POST /trade/add
app.post('/trade/add', requiresLogin, async (req, res) => {
  var body = JSON.parse(req.body.idarray);
  if(body.length > 0){
    var oldArray = [];
    for(var i=0; i<body.length; i++){
      var old = await CrownCap.findOneAndUpdate({_id: mongoose.Types.ObjectId(body[i])}, {$inc: {quantity: 1}});
      oldArray.push(old);
    }
    if(oldArray.length == body.length){
      res.redirect(req.header('Referer'));
    }
  }
});

//POST /trade/sub
app.post('/trade/sub', requiresLogin, async (req, res) => {
  var body = JSON.parse(req.body.idarray);
  if(body.length > 0){
    var oldArray = [];
    for(var i=0; i<body.length; i++){
      var old = await CrownCap.findOneAndUpdate({_id: mongoose.Types.ObjectId(body[i])}, {$inc: {quantity: -1}});
      oldArray.push(old);
    }
    if(oldArray.length == body.length){
      res.redirect(req.header('Referer'));
    }
  }
});

//GET /train
app.get('/train', requiresLogin, async (req, res) => {
  res.redirect('/dashboard?success=true');
  trainModel();
});

//Alle anderen Umleiten zu /
app.get('*', (req, res) => {
    res.redirect('/');
});

app.listen(port, () => {
  console.log(`Gestartet auf Port ${port}`);
  importModel();
  setInterval(trainModel, 60 * 60000);
});
