var mongoose = require('mongoose');

//Mongoose Model erstellen
var RecommenderModel = mongoose.model('Recommender-Model', {
  model: {
    type: String,
    required: true,
    minlength: 1
  }
});

module.exports = {RecommenderModel};
