var mongoose = require('mongoose');

//Mongoose Model erstellen
var CrownCap = mongoose.model('CrownCap', {
  name: {
    type: String,
    required: true,
    minlength: 1,
    trim: true
  },
  brand: {
    type: String,
    required: true,
    minlength: 1,
    trim: true
  },
  image: {
    type: String,
    required: true,
    minlength: 1,
    trim: true
  },
  country: {
    type: String,
    required: true,
    minlength: 1,
    trim: true
  },
  addedAt: {
    type: Number,
    required: true
  },
  _addedBy: {
    type: mongoose.Schema.Types.ObjectId,
    required: true
  },
  typeOfDrink: {
    type: String,
    trim: true,
    minlength: 1
  },
  tried: {
    type: Boolean
  },
  tags: {
    type: String,
    trim: true
  },
  special: {
    type: Boolean
  }
});

module.exports = {CrownCap};