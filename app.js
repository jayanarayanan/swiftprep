const express = require("express");
const ejs = require("ejs");
const path = require("path");
const multer = require("multer");
const aws = require('aws-sdk');
const multers3 = require('multer-s3');
const { Server } = require("http");

// const storage = multer.diskStorage({
//     destination: './public/uploads',
//     filename: function(req, file, cb) {
//         cb(null, file.fieldname + '-' + Date.now() + path.extname(file.originalname))
//     }
// })

const s3 = new aws.S3({
    accessKeyId: 'AKIAJU7CNRSTYYSY5L6Q',
    secretAccessKey: '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',
    Bucket: 'startupbucket'
})

const upload = multer({
    storage: multers3({
        s3: s3,
        bucket: 'startupbucket',
        acl: 'public-read',
        contentLength: '5000000000',
        filename: function(req, file, cb) {
            cb(null, file.fieldname + '-' + Date.now() + path.extname(file.originalname)); 
        }
    }),
    fileFilter: function(req, file, cb) {
        checkFileType(file, cb);
    }
}).single('file');

function checkFileType(file, cb) {
    const fileTypes = /mov|mp4|m4v|wmv|mkv|jpg|jpeg/;
    const extname = fileTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = fileTypes.test(file.mimetype);
    if(mimetype && extname) {
        return cb(null, true);
    } else {
        cb('Error: Video only');
    }
}

const app = express();

app.set('view engine', 'ejs');

app.use(express.static('./public'));


app.get('/', function(req, res) {
    res.render('index');
});

app.post('/upload', function(req, res) {
    upload(req, res, function(err) {
        if(err) {
            res.render('index', {msg: err});
        } else {
            if(req.file == undefined) {
                res.render('index', {msg: 'No file selected.'});
            } else {
                res.render('index', {msg: 'File uploaded.'});
                console.log(req.file);
            }
        }
    })
})

app.listen(3000, "localhost", function(){
   console.log("SERVER IS RUNNING!");
});