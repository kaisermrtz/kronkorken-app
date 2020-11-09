var {
  mongoose
} = require('./../db/mongoose');
var {
  CrownCap
} = require('./../models/crowncap');
var {
  RecommenderModel
} = require('./../models/recommender-model');
const ContentBasedRecommender = require('content-based-recommender');
const recommender = new ContentBasedRecommender({
  minScore: 0.1,
  maxSimilarDocuments: 50
});


async function trainModel() {
  const crowncaps = await CrownCap.find({});
  const documents = [];
  crowncaps.forEach((crowncap) => {
    documents.push({
      id: crowncap._id,
      content: `${crowncap.brand} ${crowncap.name} ${crowncap.country} ${crowncap.typeofDrink} ${crowncap.tags} ${crowncap.special}`
    });
  });
  recommender.train(documents);
  const object = recommender.export();

  //In der Datenbank speichern
  try {
    const oldModel = await RecommenderModel.findOne({});
    if (!oldModel) {
      var model = new RecommenderModel({
        model: JSON.stringify(object)
      });
      model.save();
    } else {
      const newModel = await RecommenderModel.findOneAndUpdate({
        _id: oldModel._id
      }, {
        $set: {
          model: JSON.stringify(object)
        }
      });
    }
    console.log("Fertig trainiert und gespeichert");
  } catch (e) {
    console.log("Es ist ein Fehler beim Speichern des Models aufgetreten");
  }
}

async function importModel() {
  const model = await RecommenderModel.findOne({});
  if (model) {
    recommender.import(JSON.parse(model.model));
  }
}

function getSimilarDocuments(id, howMuch) {
  const similarDocuments = recommender.getSimilarDocuments(id, 0, howMuch);
  return similarDocuments;
}

module.exports = {
  trainModel,
  getSimilarDocuments,
  importModel
};