const express = require('express');
const path = require('path');

var app = express();
const port = process.env.PORT || 3000;
const publicPath = path.join(__dirname, '../public');

app.use(express.static(publicPath));

app.get('/', (req, res) => {

});

app.listen(port, () => {
  console.log(`Gestartet auf Port ${port}`);
});
