var mongoose = require('mongoose')

mongoose.Promise = global.Promise
mongoose.connect(process.env.DB_URI)

module.exports = {
  mongoose,
}
