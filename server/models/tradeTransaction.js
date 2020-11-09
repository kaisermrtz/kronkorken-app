var mongoose = require('mongoose');
const validator = require('validator');

//Mongoose Model erstellen
var TradeTransaction = mongoose.model('TradeTransaction', {
  _tradePartner: {
    type: mongoose.Schema.Types.ObjectId,
    required: true
  },
  date: {
    type: Number,
    required: true
  },
  _addedBy: {
    type: mongoose.Schema.Types.ObjectId,
    required: true
  },
  sendCapsJSON: {
    type: String
  },
  count: {
    type: Number
  },
  blind: {
    type: Boolean
  }
});

module.exports = {
  TradeTransaction
};