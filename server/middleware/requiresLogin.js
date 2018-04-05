var {User} = require('./../models/user');

var requiresLogin = (req, res, next) => {
  if (req.session && req.session.userId){
    return next();
  }else{
    res.redirect('/');
    // var err = new Error('You must be logged in to view this page.');
    // err.status = 401;
    // return next(err);
    return next();
  }
};

module.exports = {requiresLogin};
