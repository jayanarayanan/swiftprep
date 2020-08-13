const express = require("express");
const ejs = require("ejs");
const path = require("path");
const bodyParser = require("body-parser");
const cookieSession = require("cookie-session");
const passport = require('passport');
const mongoose = require("mongoose");
const socket = require("socket.io");
const passportLocalMongoose = require("passport-local-mongoose");
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const keys = require("./rootaccess.js");
const middleware = require("./middleware");
const { PassThrough } = require("stream");

const app = express();

mongoose.connect("mongodb://localhost:27017/swiftprep-videos", {useNewUrlParser: true, useUnifiedTopology: true, useFindAndModify: false });

app.set('view engine', 'ejs');
app.use(express.static(__dirname + '/public'));
app.use(bodyParser.urlencoded({ extended : true }));
app.use(cookieSession({
    maxAge: 6*60*60*1000,
    keys: [keys.session.cookieKey]
}))

//MongoDB Schemas
var videoSchema = new mongoose.Schema({
    VName: String,
    Mentor: String,
});
var Video = mongoose.model("Video", videoSchema);

var userSchema = new mongoose.Schema({
    username: String,
    googleID: String,
    loggedDevices: {type: Number, default: 0}
});
var User = mongoose.model("User", userSchema);

//Passport config
app.use(passport.initialize());
app.use(passport.session());
passport.serializeUser((user, done)=> {
    done(null, user.id);
});
passport.deserializeUser((id, done) => {
    User.findById(id).then((user) => {
        done(null, user);
    })
})

passport.use(
    new GoogleStrategy({
        // options for google strategy
        callbackURL: '/google/redirect',
        clientID: keys.google.clientID,
        clientSecret: keys.google.clientSecret
    }, (accessToken, refreshToken, profile, done) => {
        // passport callback function
        User.findOne({googleID: profile.id}).then((currentUser) => {
            if(currentUser) {
                console.log("user is : " + currentUser);
                done(null, currentUser);
            } else {
                new User({
                    username: profile.displayName,
                    googleID: profile.id,
                }).save().then((newUser) => {
                    console.log("new user created: " + newUser);
                    done(null, newUser);
                });
            }
        })
    })
);


app.use(function(req, res, next){
    res.locals.currentUser = req.user;
    next();
 });

 //homepage
app.get('/', function(req, res) {
    res.render('index');
});

//Search results
app.post('/search', function(req, res) {
    var s = req.body.search;
    res.render('showVideo', {link: keys.aws.urlCode, file: s});
});

//View private page(only if the user is logged in)
app.get('/view', function(req, res) {
    if(req.user) {
        res.render('showVideo', {link: keys.aws.urlCode, file: 'BITS-CS-5-MI-2'});
    } else {
        res.redirect('/google');
    }
    
});

//Login page
app.get('/google', passport.authenticate('google', {
    scope: ['profile'],
})
);

//Passport auth
app.get('/google/redirect', passport.authenticate('google'), function(req, res) {
    res.redirect('/');
});

//logout page
app.get('/logout', function(req, res) {
    req.logout();
    res.redirect('/');
});

//listener
var server = app.listen(3000, "localhost", function(){
    console.log("SERVER IS RUNNING!");
 });

var io = socket(server);
io.on('connection', (socket) => {
    console.log("Made socket connection.");

    socket.on('play', function(curUser) {
        User.findById(curUser, function(err, foundUser) {
            foundUser.loggedDevices++;
            console.log(foundUser.loggedDevices);
            socket.emit('play', foundUser.loggedDevices);
        });
    });

    socket.on('pause', function(curUser) {
        User.findById(curUser, function(err, foundUser) {
            foundUser.loggedDevices--;
            console.log(foundUser.loggedDevices);
            socket.emit('pause', foundUser.loggedDevices);
        });
    });
});