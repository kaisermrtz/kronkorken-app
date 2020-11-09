var {
  User
} = require('./../models/user');

var requiresLogin = (req, res, next) => {
  if (req.session && req.session.userId) {
    return next();
  } else {
    res.redirect('/');
  }
};
module.exports = {
  requiresLogin
};