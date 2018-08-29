var mongoose = require('mongoose');
const validator = require('validator');

//Mongoose Model erstellen
var TradePartner = mongoose.model('TradePartner', {
  name: {
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
  email: {
    type: String,
    required: true,
    trim: true,
    minlength: 1,
    unique: true,
    validate: {
      validator: validator.isEmail,
      message: '{VALUE} is not a valid email'
    }
  },
  website: {
    type: String,
    trim: true,
    unique: true
  }
});

module.exports = {TradePartner};
