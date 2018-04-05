const express = require('express');
const path = require('path');
const hbs = require('hbs');

var app = express();
const port = process.env.PORT || 3000;
const publicPath = path.join(__dirname, '../public');

hbs.registerPartials(__dirname + '/../views/partials');
app.set('view engine', 'hbs');

app.use(express.static(publicPath));

//Für Daten die auf mehreren Seiten gleich sind!
hbs.registerHelper('getCurrentYear', () => {
  return new Date().getFullYear();
});

app.get('/', (req, res) => {
  res.render('home.hbs',{
    pageTitle: 'Kronkorken App',
    welcomeMessage: 'Willkommen zur NodeJS Kronkorkenseite'
  });
});

app.get('/sammlung', (req, res) => {
  res.render('sammlung.hbs', {
    pageTitle: 'Kronkorken Sammlung'
  });
});

app.listen(port, () => {
  console.log(`Gestartet auf Port ${port}`);
});
