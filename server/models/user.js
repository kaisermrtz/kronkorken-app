const mongoose = require('mongoose');
const validator = require('validator');
const bcrypt = require('bcryptjs');

var UserSchema = new mongoose.Schema({
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
  username: {
    type: String,
    unique: true,
    required: true,
    trim: true,
    minlength: 2
  },
  password: {
    type: String,
    required: true,
    minlength: 8
  }
});

UserSchema.statics.authenticate = function (email, password) {
  var User = this;

  return User.findOne({
    email
  }).then((user) => {
    if (!user || user === null) {
      return Promise.reject('Ihre Benutzername Passwort Kombination ist falsch!');
    }

    return new Promise((resolve, reject) => {
      bcrypt.compare(password, user.password, (err, res) => {
        if (res) {
          resolve(user);
        } else {
          reject('Ihre Benutzername Passwort Kombination ist falsch!');
        }
      });
    });
  });
};

//Middleware: Aufruf vor jedem save
UserSchema.pre('save', function (next) {
  var user = this;
  //nur verschlüsseln beim save wenn das Passwort gerade modifiziert wurde
  if (user.isModified('password')) {
    bcrypt.genSalt(10, (err, salt) => {
      bcrypt.hash(user.password, salt, (err, hash) => {
        user.password = hash;
        next();
      });
    });
  } else {
    next();
  }
});

var User = mongoose.model('User', UserSchema);
module.exports = {
  User
};