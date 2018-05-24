var {mongoose} = require('./../db/mongoose');
var {CrownCap} = require('./../models/crowncap');
const ContentBasedRecommender = require('content-based-recommender');
const recommender = new ContentBasedRecommender({
  minScore: 0.1,
  maxSimilarDocuments: 50
});


async function trainModel(){
  const crowncaps = await CrownCap.find({});
  const documents = [];
  crowncaps.forEach((crowncap) => {
    documents.push({ id: crowncap._id, content: `${crowncap.brand} ${crowncap.name} ${crowncap.country} ${crowncap.typeofDrink} ${crowncap.tags} ${crowncap.special}`});
  });
  recommender.train(documents);
  const object = recommender.export();
  //Könnte man jetzt hier speichern
  console.log("Fertig trainiert");
}

function getSimilarDocuments(id, howMuch){
  const similarDocuments = recommender.getSimilarDocuments(id, 0, howMuch);
  return similarDocuments;
}

module.exports = {trainModel, getSimilarDocuments};
