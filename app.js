const express = require("express");
const ejs = require("ejs");
const path = require("path");
const bodyParser = require("body-parser");
const methodOverride = require("method-override");
const cookieSession = require("cookie-session");
const passport = require("passport");
const mongoose = require("mongoose");
const socket = require("socket.io");
const passportLocalMongoose = require("passport-local-mongoose");
const GoogleStrategy = require("passport-google-oauth20").Strategy;
const keys = require("./rootaccess.js");
const middleware = require("./middleware");
const { PassThrough } = require("stream");

const app = express();
try {
    mongoose.connect(process.env.MONGO_URL, {
        useNewUrlParser: true,
        useUnifiedTopology: true,
        useFindAndModify: false,
    });
} catch (err) {
    console.log(err);
}

// mongoose.connect("mongodb://localhost:27017/swiftprep-videos", {useNewUrlParser: true, useUnifiedTopology: true, useFindAndModify: false });

app.set("view engine", "ejs");
app.use((req, res, next) => {
    if (req.header("x-forwarded-proto") !== "https") {
        res.redirect(`https://${req.header("host")}${req.url}`);
    } else {
        next();
    }
});
app.use(express.static(__dirname + "/public"));
app.use(bodyParser.urlencoded({ extended: true }));
app.use(methodOverride("_method"));
app.use(
    cookieSession({
        maxAge: 6 * 60 * 60 * 1000,
        keys: [keys.session.cookieKey],
    })
);

//MongoDB Schemas
var userSchema = new mongoose.Schema({
    username: String,
    googleID: String,
    dp: String,
    loggedDevices: { type: Number, default: 0 },
});
var User = mongoose.model("User", userSchema);

var mentorSchema = new mongoose.Schema({
    name: String,
    dp: String,
    college: String,
    sem: Number,
    subject: String,
    description: String,
});
var Mentor = mongoose.model("Mentor", mentorSchema);

var commentSchema = new mongoose.Schema({
    text: String,
    created: { type: Date, default: Date.now },
    Likes: { type: Number, default: 0 },
    author: {
        id: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
        },
        username: String,
        dp: String,
    },
    replies: [
        {
            id: mongoose.Schema.Types.ObjectId,
            text: String,
            created: { type: Date, default: Date.now },
            Likes: { type: Number, default: 0 },
            author: {
                id: {
                    type: mongoose.Schema.Types.ObjectId,
                    ref: "User",
                },
                username: String,
                dp: String,
            },
        },
    ],
});
var Comment = mongoose.model("Comment", commentSchema);

var videoSchema = new mongoose.Schema({
    CBS: String,
    Subject: String,
    SubShort: String,
    Chapter: Number,
    VName: String,
    Thumbnail: String,
    Notes: String,
    Likes: { type: Number, default: 0 },
    Mentor: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Mentor",
    },
    comments: [
        {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Comment",
        },
    ],
});
var Video = mongoose.model("Video", videoSchema);

var Reply = {
    text: String,
    author: {
        id: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
        },
        username: String,
        dp: String,
    },
};

//Passport config
app.use(passport.initialize());
app.use(passport.session());
passport.serializeUser((user, done) => {
    done(null, user.id);
});
passport.deserializeUser((id, done) => {
    User.findById(id).then((user) => {
        done(null, user);
    });
});

passport.use(
    new GoogleStrategy(
        {
            // options for google strategy
            callbackURL: "https://" + process.env.MY_URL + "/google/redirect",
            clientID: keys.google.clientID,
            clientSecret: keys.google.clientSecret,
        },
        (accessToken, refreshToken, profile, done) => {
            // passport callback function
            User.findOne({ googleID: profile.id }).then((currentUser) => {
                if (currentUser) {
                    console.log(profile);
                    console.log("user is : " + currentUser);
                    done(null, currentUser);
                } else {
                    new User({
                        username: profile.displayName,
                        googleID: profile.id,
                        dp: profile.photos[0].value,
                    })
                        .save()
                        .then((newUser) => {
                            console.log("new user created: " + newUser);
                            done(null, newUser);
                        });
                }
            });
        }
    )
);

app.use(function (req, res, next) {
    res.locals.currentUser = req.user;
    next();
});

//homepage
app.get("/", function (req, res) {
    console.log(process.env.MY_URL);
    console.log(process.env.MONGO_URL);
    res.render("index");
});

app.get("/privacy", function (req, res) {
    res.render("privacy");
});

// filter page
app.get("/filter", function (req, res) {
    res.render("filter");
});

//add recors to database
app.get("/database", function (req, res) {
    res.redirect("/");
});

//listing subjects
app.post("/filter", function (req, res) {
    var cbs = req.body.college + "-" + req.body.branch + "-" + "5";
    Video.find({ CBS: cbs }, function (err, foundVideos) {
        if (err) {
            console.log(err);
        } else {
            Video.aggregate(
                [
                    {
                        $match: { CBS: cbs },
                    },
                    {
                        $group: {
                            _id: "$Subject",
                        },
                    },
                ],
                function (err, subUnique) {
                    if (err) {
                        console.log(err);
                    } else {
                        console.log(subUnique);
                        res.render("list", {
                            videos: foundVideos,
                            subunique: subUnique,
                        });
                    }
                }
            );
        }
    });
});

//View video page
app.get("/view/:id", function (req, res) {
    if (req.user) {
        Video.findById(req.params.id)
            .populate("Mentor")
            .populate("comments")
            .exec(function (err, foundVideo) {
                if (err) {
                    console.log(err);
                } else {
                    res.render("view", {
                        bucket: keys.aws.bucket,
                        link: keys.aws.link,
                        bucketNotes: keys.aws.bucketNotes,
                        video: foundVideo,
                    });
                }
            });
    } else {
        res.redirect("/google");
    }
});

//Display the comments in the view page
app.get("/view/:id/comment", function (req, res) {
    if (req.user) {
        Video.findById(req.params.id)
            .populate("comments")
            .exec(function (err, foundVideo) {
                if (err) {
                    console.log(err);
                } else {
                    res.render("comments", { video: foundVideo });
                }
            });
    } else {
        res.redirect("/google");
    }
});

//Add a comment
app.post("/view/:id/comment", function (req, res) {
    Video.findById(req.params.id, function (err, foundVideo) {
        if (err) {
            console.log(err);
        } else {
            Comment.create(
                { text: req.body.comment },
                function (err, newComment) {
                    if (err) {
                        console.log(err);
                    } else {
                        newComment.author.username = req.user.username;
                        newComment.author.id = req.user._id;
                        newComment.author.dp = req.user.dp;
                        newComment.save();
                        foundVideo.comments.push(newComment);
                        foundVideo.save();
                        res.redirect("/view/" + foundVideo._id + "/comment");
                    }
                }
            );
        }
    });
});

//Delete a comment
app.delete("/view/:id/:commentId", function (req, res) {
    Comment.findByIdAndRemove(req.params.commentId, function (err) {
        if (err) {
            console.log(err);
            res.redirect("/");
        } else {
            res.redirect("/view/" + req.params.id + "/comment");
        }
    });
});

//Add a reply
app.post("/view/:id/:commentId/reply", function (req, res) {
    Video.findById(req.params.id, function (err, foundVideo) {
        if (err) {
            console.log(err);
        } else {
            Comment.findById(
                req.params.commentId,
                function (err, foundComment) {
                    if (err) {
                        console.log(err);
                    } else {
                        Reply.text = req.body.reply;
                        Reply.author.username = req.user.username;
                        Reply.author.id = req.user._id;
                        Reply.author.dp = req.user.dp;
                        foundComment.replies.push(Reply);
                        foundComment.save();
                        console.log(foundComment);
                        res.redirect("/view/" + foundVideo._id + "/comment");
                    }
                }
            );
        }
    });
});

//Delete a reply
app.delete("/view/:id/:commentId/:replyId", function (req, res) {
    Comment.updateOne(
        { _id: req.params.commentId },
        { $pull: { replies: { _id: req.params.replyId } } },
        function (err, foundComment) {
            if (err) {
                console.log(err);
                res.redirect("/");
            } else {
                res.redirect("/view/" + req.params.id + "/comment");
            }
        }
    );
});

//Login page
app.get(
    "/google",
    passport.authenticate("google", {
        scope: ["profile"],
        prompt: "select_account",
    })
);

//Passport auth
app.get(
    "/google/redirect",
    passport.authenticate("google"),
    function (req, res) {
        res.redirect("/filter");
    }
);

//logout page
app.get("/logout", function (req, res) {
    req.logout();
    res.redirect("/");
});

//listener
app.listen(process.env.PORT, process.env.IP, function () {
    console.log("SERVER IS RUNNING!");
});
// app.listen(3000, 'localhost', function(){
//     console.log("SERVER IS RUNNING!");
// })

// Mentor.create({
//     name: "Haritha GB",
//     dp: "https://swiftprep-main-mentor-images.s3.ap-south-1.amazonaws.com/HarithaGB.jpeg",
//     college: "PES University",
//     sem: 5,
//     subject: "Digital Image Processing",
//     description:
//         "Haritha is a third-year ECE student who is passionate about image processing and computer vision. She believes in using deep learning and CV to accelerate change for good and aims to bring about change in her own way.",
// });
// Mentor.create({
//     name: "Ananya Veeraraghavan",
//     dp: "https://swiftprep-main-mentor-images.s3.ap-south-1.amazonaws.com/AnanyaV.jpeg",
//     college: "PES University",
//     sem: 5,
//     subject: "Operating System",
//     description:
//         "Ananya has provided education to underprivileged children for more than 2 years, and she is very passionate about making education relatable and more easy to understand.",
// });
// Mentor.create({
//     name: "Sakshi Shetty",
//     dp: "https://swiftprep-main-mentor-images.s3.ap-south-1.amazonaws.com/SakshiS.jpeg",
//     college: "PES University",
//     sem: 5,
//     subject: "Computer Networks",
//     description:
//         "Sakshi aims to use her knowledge of technology & marketing to build products for a better tomorrow. She takes an avid interest in both Business and Computer Science, because she believes it's crucial to integrate the two for creating successful products.",
// });
// Mentor.create({
//     name: "Drishti Hoskote",
//     dp: "https://swiftprep-main-mentor-images.s3.ap-south-1.amazonaws.com/DrishtiH.jpeg",
//     college: "PES University",
//     sem: 5,
//     subject: "Machine Intelligence",
//     description:
//         "Drishti is a computer enthusiast who loves teaching and working towards a better society. She believes that technology can help build a better world.",
// });
// Mentor.create({
//     name: "Rishal MP",
//     dp: "https://swiftprep-main-mentor-images.s3.ap-south-1.amazonaws.com/RishalMP.jpeg",
//     college: "PES University",
//     sem: 5,
//     subject: "Microwave Engineering",
//     description:
//         "Rishal is passionate to explore the areas of Embedded Systems and VLSI design. She strives to continuously learn and innovate in the ever-growing world of technology using the best of her skills and ability.",
// });
// Mentor.create({
//     name: "Sharadi GR",
//     dp: "https://swiftprep-main-mentor-images.s3.ap-south-1.amazonaws.com/SharadiGR.jpeg",
//     college: "PES University",
//     sem: 5,
//     subject: "Computer Organisation",
//     description:
//         "Sharadi is a third-year ECE student who is really passionate to learn electronics and it's applications",
// });
// Mentor.create({
//     name: "Sindu NG",
//     dp: "https://swiftprep-main-mentor-images.s3.ap-south-1.amazonaws.com/SinduNG.jpeg",
//     college: "PES University",
//     sem: 5,
//     subject: "Communication Engineering",
//     description:
//         "Sindu believes that communication is the essence of connecting individuals. She aims to maximise it by making space communication efficient.",
// });
// Mentor.create({
//     name: "Sakshi Shetty",
//     dp: "https://swiftprep-main-mentor-images.s3.ap-south-1.amazonaws.com/SakshiS.jpeg",
//     college: "PES University",
//     sem: 5,
//     subject: "Computer Networks",
//     description:
//         "Sakshi aims to use her knowledge of technology & marketing to build products for a better tomorrow. She takes an avid interest in both Business and Computer Science, because she believes it's crucial to integrate the two for creating successful products.",
// });
// Mentor.create({
//     name: "Manav Somani",
//     dp: "https://swiftprep-main-mentor-images.s3.ap-south-1.amazonaws.com/ManavS.jpeg",
//     college: "PES University",
//     sem: 5,
//     subject: "Design of Machine Elements",
//     description:
//         "Manav is extroverted, goal-oriented and a smart worker with a flare for automobiles and technology. He always strives to get better with a 'Never give up' attitude.",
// });
// Mentor.create({
//     name: "Rishab N",
//     dp: "https://swiftprep-main-mentor-images.s3.ap-south-1.amazonaws.com/RishabN.jpeg",
//     college: "PES University",
//     sem: 5,
//     subject: "Principles of Energy Conservation",
//     description:
//         "Rishab is a tech enthusiast with keen observation skills. He is always trying to take inspiration from nature and incorporate them to make more efficient, effective products.",
// });
// Mentor.create({
//     name: "Ananya Angadi",
//     dp: "https://swiftprep-main-mentor-images.s3.ap-south-1.amazonaws.com/AnanyaA.jpeg",
//     college: "PES University",
//     sem: 5,
//     subject: "Operating System",
//     description:
//         "Ananya is a third year CSE student who strongly believes that computer science cannot be studied in parts, but is best appreciated as a whole, with all of it's quirks and idiosyncrasies. She likes to read in her free time, and prefers fictional worlds to the real.",
// });
// Mentor.create({
//     name: "Rishith Bhowmick",
//     dp: "https://swiftprep-main-mentor-images.s3.ap-south-1.amazonaws.com/RishithB.jpeg",
//     college: "PES University",
//     sem: 5,
//     subject: "Machine Intelligence",
//     description:
//         "Rishith is a 3rd year CSE student, and he believes that the ability to pass on his intelligence to all things living and non-living is what got him interested in Machine Learning. He desires to make an impact on people’s lives in ways never thought of.",
// });

// Video.create({CBS: 'PES-ECE-5', Subject: 'Digital Image Processing', SubShort: 'DIP', Chapter: 1, VName: 'PES-ECE-5-DIP-1', Thumbnail: "https://swiftprep-main-web-images.s3.ap-south-1.amazonaws.com/unit-1.png", Notes: "https://storage.googleapis.com/swiftprep-notes/PES-ECE-5-DIP-1.pdf", Mentor: "5f6733def90fa90017e93d6b"});
// Video.create({
//     CBS: "PES-ME-5",
//     Subject: "Design of Machine Elements",
//     SubShort: "DME",
//     Chapter: 2,
//     VName: "PES-ME-5-DME-2",
//     Thumbnail:
//         "https://swiftprep-main-web-images.s3.ap-south-1.amazonaws.com/unit-2.png",
//     Notes: "#",
//     Mentor: "5f6733def90fa90017e93d6c",
// });

// Video.create({
//     CBS: "PES-CSE-5",
//     Subject: "Computer Networks",
//     SubShort: "CN",
//     Chapter: 1,
//     VName: "PES-CSE-5-CN-1",
//     Thumbnail:
//         "https://swiftprep-main-web-images.s3.ap-south-1.amazonaws.com/unit-1.png",
//     Notes: "https://swiftprep-main-notes.s3.ap-south-1.amazonaws.com/PES-CSE-5-CN-1.zip",
//     Mentor: "611d49b244ee680018edc1f1",
// });
// Video.create({
//     CBS: "PES-CSE-5",
//     Subject: "Computer Networks",
//     SubShort: "CN",
//     Chapter: 2,
//     VName: "PES-CSE-5-CN-2",
//     Thumbnail:
//         "https://swiftprep-main-web-images.s3.ap-south-1.amazonaws.com/unit-2.png",
//     Notes: "https://swiftprep-main-notes.s3.ap-south-1.amazonaws.com/PES-CSE-5-CN-2.zip",
//     Mentor: "611d49b244ee680018edc1f1",
// });
// Video.create({
//     CBS: "PES-CSE-5",
//     Subject: "Operating System",
//     SubShort: "OS",
//     Chapter: 1,
//     VName: "PES-CSE-5-OS-1",
//     Thumbnail:
//         "https://swiftprep-main-web-images.s3.ap-south-1.amazonaws.com/unit-1.png",
//     Notes: "https://swiftprep-main-notes.s3.ap-south-1.amazonaws.com/PES-CSE-5-OS-1.pdf",
//     Mentor: "611d49b244ee680018edc1f0",
// });
// Video.create({
//     CBS: "PES-CSE-5",
//     Subject: "Operating System",
//     SubShort: "OS",
//     Chapter: 2,
//     VName: "PES-CSE-5-OS-2",
//     Thumbnail:
//         "https://swiftprep-main-web-images.s3.ap-south-1.amazonaws.com/unit-2.png",
//     Notes: "https://swiftprep-main-notes.s3.ap-south-1.amazonaws.com/PES-CSE-5-OS-2.pdf",
//     Mentor: "611d49b244ee680018edc1f9",
// });
// Video.create({
//     CBS: "PES-CSE-5",
//     Subject: "Operating System",
//     SubShort: "OS",
//     Chapter: 3,
//     VName: "PES-CSE-5-OS-3",
//     Thumbnail:
//         "https://swiftprep-main-web-images.s3.ap-south-1.amazonaws.com/unit-3.png",
//     Notes: "https://swiftprep-main-notes.s3.ap-south-1.amazonaws.com/PES-CSE-5-OS-3.pdf",
//     Mentor: "611d49b244ee680018edc1f9",
// });
// Video.create({
//     CBS: "PES-CSE-5",
//     Subject: "Machine Intelligence",
//     SubShort: "MI",
//     Chapter: 1,
//     VName: "PES-CSE-5-MI-1",
//     Thumbnail:
//         "https://swiftprep-main-web-images.s3.ap-south-1.amazonaws.com/unit-1.png",
//     Notes: "https://swiftprep-main-notes.s3.ap-south-1.amazonaws.com/PES-CSE-5-MI-1.pdf",
//     Mentor: "611d49b244ee680018edc1f2",
// });
// Video.create({
//     CBS: "PES-CSE-5",
//     Subject: "Machine Intelligence",
//     SubShort: "MI",
//     Chapter: 2,
//     VName: "PES-CSE-5-MI-2",
//     Thumbnail:
//         "https://swiftprep-main-web-images.s3.ap-south-1.amazonaws.com/unit-2.png",
//     Notes: "https://swiftprep-main-notes.s3.ap-south-1.amazonaws.com/PES-CSE-5-MI-2.pdf",
//     Mentor: "611d49b244ee680018edc1fa",
// });
// Video.create({
//     CBS: "PES-ECE-5",
//     Subject: "Digital Image Processing",
//     SubShort: "DIP",
//     Chapter: 1,
//     VName: "PES-ECE-5-DIP-1",
//     Thumbnail:
//         "https://swiftprep-main-web-images.s3.ap-south-1.amazonaws.com/unit-1.png",
//     Notes: "https://swiftprep-main-notes.s3.ap-south-1.amazonaws.com/PES-ECE-5-DIP-1.pdf",
//     Mentor: "611d49b244ee680018edc1ef",
// });
// Video.create({
//     CBS: "PES-ECE-5",
//     Subject: "Digital Image Processing",
//     SubShort: "DIP",
//     Chapter: 2,
//     VName: "PES-ECE-5-DIP-2",
//     Thumbnail:
//         "https://swiftprep-main-web-images.s3.ap-south-1.amazonaws.com/unit-2.png",
//     Notes: "https://swiftprep-main-notes.s3.ap-south-1.amazonaws.com/PES-ECE-5-DIP-2.zip",
//     Mentor: "611d49b244ee680018edc1ef",
// });
// Video.create({
//     CBS: "PES-ECE-5",
//     Subject: "Communication Engineering",
//     SubShort: "CE",
//     Chapter: 1,
//     VName: "PES-ECE-5-CE-1",
//     Thumbnail:
//         "https://swiftprep-main-web-images.s3.ap-south-1.amazonaws.com/unit-1.png",
//     Notes: "https://swiftprep-main-notes.s3.ap-south-1.amazonaws.com/PES-ECE-5-CE-1.pdf",
//     Mentor: "611d49b244ee680018edc1f5",
// });
// Video.create({
//     CBS: "PES-ECE-5",
//     Subject: "Communication Engineering",
//     SubShort: "CE",
//     Chapter: 2,
//     VName: "PES-ECE-5-CE-2",
//     Thumbnail:
//         "https://swiftprep-main-web-images.s3.ap-south-1.amazonaws.com/unit-2.png",
//     Notes: "https://swiftprep-main-notes.s3.ap-south-1.amazonaws.com/PES-ECE-5-CE-2.pdf",
//     Mentor: "611d49b244ee680018edc1f5",
// });
// Video.create({
//     CBS: "PES-ECE-5",
//     Subject: "Computer Organization",
//     SubShort: "CO",
//     Chapter: 1,
//     VName: "PES-ECE-5-CO-1",
//     Thumbnail:
//         "https://swiftprep-main-web-images.s3.ap-south-1.amazonaws.com/unit-1.png",
//     Notes: "https://swiftprep-main-notes.s3.ap-south-1.amazonaws.com/PES-ECE-5-CO-1.pdf",
//     Mentor: "611d49b244ee680018edc1f4",
// });
// Video.create({
//     CBS: "PES-ECE-5",
//     Subject: "Microwave Engineering",
//     SubShort: "ME",
//     Chapter: 1,
//     VName: "PES-ECE-5-ME-1",
//     Thumbnail:
//         "https://swiftprep-main-web-images.s3.ap-south-1.amazonaws.com/unit-1.png",
//     Notes: "https://swiftprep-main-notes.s3.ap-south-1.amazonaws.com/PES-ECE-5-ME-1.zip",
//     Mentor: "611d49b244ee680018edc1f3",
// });
// Video.create({
//     CBS: "PES-ECE-5",
//     Subject: "Microwave Engineering",
//     SubShort: "ME",
//     Chapter: 2,
//     VName: "PES-ECE-5-ME-2",
//     Thumbnail:
//         "https://swiftprep-main-web-images.s3.ap-south-1.amazonaws.com/unit-2.png",
//     Notes: "https://swiftprep-main-notes.s3.ap-south-1.amazonaws.com/PES-ECE-5-ME-2.zip",
//     Mentor: "611d49b244ee680018edc1f3",
// });
// Video.create({
//     CBS: "PES-ME-5",
//     Subject: "Design of Machine Elements",
//     SubShort: "DME",
//     Chapter: 1,
//     VName: "PES-ME-5-DME-1",
//     Thumbnail:
//         "https://swiftprep-main-web-images.s3.ap-south-1.amazonaws.com/unit-1.png",
//     Notes: "https://swiftprep-main-notes.s3.ap-south-1.amazonaws.com/PES-ME-5-DME-1.zip",
//     Mentor: "611d49b244ee680018edc1f7",
// });
// Video.create({
//     CBS: "PES-ME-5",
//     Subject: "Design of Machine Elements",
//     SubShort: "DME",
//     Chapter: 2,
//     VName: "PES-ME-5-DME-2",
//     Thumbnail:
//         "https://swiftprep-main-web-images.s3.ap-south-1.amazonaws.com/unit-2.png",
//     Notes: "#",
//     Mentor: "611d49b244ee680018edc1f7",
// });
// Video.create({
//     CBS: "PES-ME-5",
//     Subject: "Principles of Energy Conservation",
//     SubShort: "PEC",
//     Chapter: 1,
//     VName: "PES-ME-5-PEC-1",
//     Thumbnail:
//         "https://swiftprep-main-web-images.s3.ap-south-1.amazonaws.com/unit-1.png",
//     Notes: "https://swiftprep-main-notes.s3.ap-south-1.amazonaws.com/PES-ME-5-PEC-1.pdf",
//     Mentor: "611d49b244ee680018edc1f8",
// });
// Video.create({
//     CBS: "PES-ME-5",
//     Subject: "Principles of Energy Conservation",
//     SubShort: "PEC",
//     Chapter: 2,
//     VName: "PES-ME-5-PEC-2",
//     Thumbnail:
//         "https://swiftprep-main-web-images.s3.ap-south-1.amazonaws.com/unit-2.png",
//     Notes: "#",
//     Mentor: "611d49b244ee680018edc1f8",
// });
// Video.create({
//     CBS: "VIT-CSE-5",
//     Subject: "Data Structures and Algorithms",
//     SubShort: "DSA",
//     Chapter: 1,
//     VName: "VIT-CSE-5-DSA-1.mp4",
//     Thumbnail:
//         "https://swiftprep-main-web-images.s3.ap-south-1.amazonaws.com/unit-1.png",
//     Notes:
//         "https://swiftprep-notes.s3.ap-south-1.amazonaws.com/VIT-CSE-5-DSA-1.pptx",
//     Mentor: "603d9ce12513240017f8ac95",
// });
// Video.create({
//     CBS: "VIT-CSE-5",
//     Subject: "Data Structures and Algorithms",
//     SubShort: "DSA",
//     Chapter: 2,
//     VName: "VIT-CSE-5-DSA-2.wmv",
//     Thumbnail:
//         "https://swiftprep-main-web-images.s3.ap-south-1.amazonaws.com/unit-2.png",
//     Notes:
//         "https://swiftprep-notes.s3.ap-south-1.amazonaws.com/VIT-CSE-5-DSA-2.pdf",
//     Mentor: "603d9ce12513240017f8ac94",
// });
// Video.create({
//     CBS: "VIT-CSE-5",
//     Subject: "Computer Architecture and Organization",
//     SubShort: "CAO",
//     Chapter: 1,
//     VName: "VIT-CSE-5-CAO-1.mp4",
//     Thumbnail:
//         "https://swiftprep-main-web-images.s3.ap-south-1.amazonaws.com/unit-1.png",
//     Notes:
//         "https://swiftprep-notes.s3.ap-south-1.amazonaws.com/VIT-CSE-5-COA-1.zip",
//     Mentor: "603d9ce12513240017f8ac96",
// });
